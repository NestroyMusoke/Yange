import { describe, expect, it } from "vitest";
import { resolveSession } from "./session";

describe("signed anonymous session", () => {
  it("accepts a current token and rotates it after the server-side expiry", () => {
    const secret = "test-secret-with-at-least-thirty-two-characters";
    const issued = resolveSession(undefined, secret, true, () => "2026-08-14T08:00:00.000Z");
    const cookie = issued.setCookie?.split(";")[0];
    if (!cookie) throw new Error("Expected a session cookie.");

    const current = resolveSession(cookie, secret, true, () => "2026-08-20T08:00:00.000Z");
    const expired = resolveSession(cookie, secret, true, () => "2026-09-14T08:00:01.000Z");

    expect(current.userId).toBe(issued.userId);
    expect(current.setCookie).toBeNull();
    expect(expired.userId).not.toBe(issued.userId);
    expect(expired.setCookie).toContain("Secure");
  });
});
