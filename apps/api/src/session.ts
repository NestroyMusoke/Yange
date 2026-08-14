import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

interface SessionPayload {
  sub: string;
  issuedAt: string;
}

export interface SessionIdentity {
  userId: string;
  setCookie: string | null;
}

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function cookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const segment of cookieHeader.split(";")) {
    const [key, ...parts] = segment.trim().split("=");
    if (key === name) return parts.join("=");
  }
  return null;
}

function encode(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

function decode(token: string, secret: string, nowMs: number): SessionPayload | null {
  const [body, receivedSignature, extra] = token.split(".");
  if (!body || !receivedSignature || extra) return null;
  const expectedSignature = signature(body, secret);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<SessionPayload>;
    if (!candidate.sub || !candidate.issuedAt || !candidate.sub.startsWith("user-")) return null;
    const issuedAt = Date.parse(candidate.issuedAt);
    if (!Number.isFinite(issuedAt)) return null;
    if (issuedAt > nowMs + 5 * 60_000 || nowMs - issuedAt > 30 * 24 * 60 * 60_000) return null;
    return { sub: candidate.sub, issuedAt: candidate.issuedAt };
  } catch {
    return null;
  }
}

export function resolveSession(
  cookieHeader: string | undefined,
  secret: string,
  secure: boolean,
  now: () => string = () => new Date().toISOString(),
): SessionIdentity {
  const currentTime = now();
  const existing = cookieValue(cookieHeader, "yange_session");
  const decoded = existing ? decode(existing, secret, Date.parse(currentTime)) : null;
  if (decoded) return { userId: decoded.sub, setCookie: null };
  const payload = { sub: `user-${randomUUID()}`, issuedAt: currentTime };
  const attributes = [
    `yange_session=${encode(payload, secret)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000",
    ...(secure ? ["Secure"] : []),
  ];
  return { userId: payload.sub, setCookie: attributes.join("; ") };
}
