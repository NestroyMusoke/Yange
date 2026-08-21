import { useEffect, useMemo, useState } from "react";
import type { StyleAuraProfile } from "./palette";

const STORAGE_KEY = "yange.style-aura-projection.v1";
export const MAX_PALETTE_LEARNING_RATE = 0.08;

interface StoredProjection {
  signature: string;
  colours: [string, string, string, string];
  updatedAt: string;
}

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

function toHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0").toUpperCase();
}

export function blendHex(from: string, to: string, amount: number): string {
  const safeAmount = Math.min(1, Math.max(0, amount));
  if (!/^#[0-9a-f]{6}$/i.test(from) || !/^#[0-9a-f]{6}$/i.test(to)) return to;
  return `#${[1, 3, 5].map((offset) =>
    toHex(channel(from, offset) * (1 - safeAmount) + channel(to, offset) * safeAmount),
  ).join("")}`;
}

export function advanceProjectedPalette(
  current: readonly string[],
  target: readonly string[],
  rate = MAX_PALETTE_LEARNING_RATE,
): [string, string, string, string] {
  return [0, 1, 2, 3].map((index) =>
    blendHex(current[index] ?? target[index], target[index] ?? current[index], rate),
  ) as [string, string, string, string];
}

function signature(profile: StyleAuraProfile): string {
  return JSON.stringify({
    colours: profile.colours,
    evidence: profile.evidenceCount,
    negative: profile.sources.negativeSignals,
    exact: profile.sources.exactColourEvidence,
  });
}

function readProjection(profile: StyleAuraProfile): StoredProjection {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) as Partial<StoredProjection> : null;
    if (parsed && Array.isArray(parsed.colours) && parsed.colours.length === 4
      && parsed.colours.every((colour) => typeof colour === "string" && /^#[0-9a-f]{6}$/i.test(colour))) {
      return {
        signature: typeof parsed.signature === "string" ? parsed.signature : "legacy",
        colours: parsed.colours as [string, string, string, string],
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      };
    }
  } catch {
    // A blocked or corrupt local store must never break wardrobe decisions.
  }
  return { signature: signature(profile), colours: [...profile.colours], updatedAt: new Date().toISOString() };
}

function writeProjection(projection: StoredProjection): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projection));
  } catch {
    // Rendering continues in memory when storage is unavailable.
  }
}

export function useGradualAuraProfile(profile: StyleAuraProfile): StyleAuraProfile {
  const profileSignature = useMemo(() => signature(profile), [profile]);
  const [projection, setProjection] = useState<StoredProjection>(() => readProjection(profile));

  useEffect(() => {
    if (projection.signature === profileSignature) return;
    const next: StoredProjection = {
      signature: profileSignature,
      colours: advanceProjectedPalette(projection.colours, profile.colours),
      updatedAt: new Date().toISOString(),
    };
    writeProjection(next);
    setProjection(next);
  }, [profile, profileSignature, projection]);

  return useMemo(() => ({ ...profile, colours: projection.colours }), [profile, projection.colours]);
}

export function resetAuraProjection(): void {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
}
