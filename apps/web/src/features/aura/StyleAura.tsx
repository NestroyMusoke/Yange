import { useEffect, useRef, useState } from "react";
import type { StyleAuraProfile } from "./palette";

export type AuraStatus = "starting" | "live" | "adaptive" | "frozen" | "fallback";

export interface AuraPaletteEntry {
  hex: string;
  weight: number;
}

declare global {
  interface Window {
    setAuraPalette?: (entries: AuraPaletteEntry[]) => void;
  }
}

interface StyleAuraProps {
  profile: StyleAuraProfile;
  energy: number;
  warmth: number;
  forcedFallback?: boolean;
  onStatusChange?: (status: AuraStatus) => void;
}

interface FluidFields {
  u: Float32Array;
  v: Float32Array;
  u0: Float32Array;
  v0: Float32Array;
  dR: Float32Array;
  dG: Float32Array;
  dB: Float32Array;
  dR0: Float32Array;
  dG0: Float32Array;
  dB0: Float32Array;
}

const N = 110;
const STRIDE = N + 2;
const SIZE = STRIDE * STRIDE;
const VISC = 0.00018;
const DIFF = 0.00012;
const DT = 0.16;
const RELAXATION_STEPS = 4;

const PROFILE_WEIGHTS = [0.9, 0.7, 0.55, 0.4] as const;
const DEFAULT_AURA_PALETTE: AuraPaletteEntry[] = [
  { hex: "#0D0F0E", weight: 0.18 },
  { hex: "#E6D8BA", weight: 0.45 },
  { hex: "#9CAB78", weight: 0.9 },
  { hex: "#6E4937", weight: 0.65 },
  { hex: "#C98C8D", weight: 0.55 },
];

function createFields(): FluidFields {
  return {
    u: new Float32Array(SIZE),
    v: new Float32Array(SIZE),
    u0: new Float32Array(SIZE),
    v0: new Float32Array(SIZE),
    dR: new Float32Array(SIZE),
    dG: new Float32Array(SIZE),
    dB: new Float32Array(SIZE),
    dR0: new Float32Array(SIZE),
    dG0: new Float32Array(SIZE),
    dB0: new Float32Array(SIZE),
  };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function ix(x: number, y: number): number {
  return x + STRIDE * y;
}

function validPalette(entries: AuraPaletteEntry[]): AuraPaletteEntry[] | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const valid = entries.filter(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      /^#[0-9a-f]{6}$/i.test(entry.hex) &&
      Number.isFinite(entry.weight) &&
      entry.weight > 0,
  );
  return valid.length > 0 ? valid.map((entry) => ({ ...entry })) : null;
}

function profilePalette(profile: StyleAuraProfile): AuraPaletteEntry[] {
  return profile.colours.map((hex, index) => ({
    hex,
    weight: PROFILE_WEIGHTS[index] ?? PROFILE_WEIGHTS.at(-1)!,
  }));
}

function semanticDefaultPalette(): AuraPaletteEntry[] {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return [
    { hex: token("--canvas", DEFAULT_AURA_PALETTE[0].hex), weight: DEFAULT_AURA_PALETTE[0].weight },
    { hex: token("--cream", DEFAULT_AURA_PALETTE[1].hex), weight: DEFAULT_AURA_PALETTE[1].weight },
    { hex: token("--olive", DEFAULT_AURA_PALETTE[2].hex), weight: DEFAULT_AURA_PALETTE[2].weight },
    DEFAULT_AURA_PALETTE[3],
    { hex: token("--rose", DEFAULT_AURA_PALETTE[4].hex), weight: DEFAULT_AURA_PALETTE[4].weight },
  ];
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function StyleAura({
  profile,
  energy,
  warmth,
  forcedFallback = false,
  onStatusChange,
}: StyleAuraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldsRef = useRef<FluidFields>(createFields());
  const paletteRef = useRef<AuraPaletteEntry[]>(DEFAULT_AURA_PALETTE.map((entry) => ({ ...entry })));
  const settingsRef = useRef({ energy: clamp(energy), warmth: clamp(warmth) });
  const onStatusRef = useRef(onStatusChange);
  const redrawFrozenRef = useRef<(() => void) | null>(null);
  const [fallback, setFallback] = useState(forcedFallback);
  const profilePaletteKey = profile.colours.join("|");

  onStatusRef.current = onStatusChange;

  useEffect(() => {
    paletteRef.current = profilePalette(profile);
    redrawFrozenRef.current?.();
  }, [profilePaletteKey]);

  useEffect(() => {
    settingsRef.current = { energy: clamp(energy), warmth: clamp(warmth) };
    redrawFrozenRef.current?.();
  }, [energy, warmth]);

  useEffect(() => {
    const previousSetter = window.setAuraPalette;
    paletteRef.current = profile.colours.length > 0 ? profilePalette(profile) : semanticDefaultPalette();
    const setter = (entries: AuraPaletteEntry[]) => {
      const nextPalette = validPalette(entries);
      if (!nextPalette) return;
      paletteRef.current = nextPalette;
      redrawFrozenRef.current?.();
    };
    window.setAuraPalette = setter;

    return () => {
      if (window.setAuraPalette !== setter) return;
      if (previousSetter) window.setAuraPalette = previousSetter;
      else delete window.setAuraPalette;
    };
  }, []);

  useEffect(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;
    const canvas = currentCanvas;
    let reported: AuraStatus | null = null;
    let frameHandle: number | null = null;
    let destroyed = false;
    let failed = false;
    let context: CanvasRenderingContext2D | null = null;
    let offscreen: HTMLCanvasElement | null = null;
    let offscreenContext: CanvasRenderingContext2D | null = null;
    let frame: ImageData | null = null;
    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let pointerX: number | null = null;
    let pointerY: number | null = null;
    let previousFrameAt = performance.now();
    let averageFrameMs = 16.7;
    let stableFrames = 0;
    const startedAt = performance.now();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fields = fieldsRef.current;

    const report = (status: AuraStatus) => {
      if (reported === status) return;
      reported = status;
      onStatusRef.current?.(status);
    };

    function stop() {
      if (frameHandle !== null) window.cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }

    function fail() {
      if (failed || destroyed) return;
      failed = true;
      stop();
      setFallback(true);
      report("fallback");
    }

    function resize() {
      if (!context) return;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(window.innerWidth * pixelRatio));
      height = Math.max(1, Math.floor(window.innerHeight * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }

    function setBnd(boundary: number, values: Float32Array) {
      for (let index = 1; index <= N; index += 1) {
        values[ix(0, index)] = boundary === 1 ? -values[ix(1, index)] : values[ix(1, index)];
        values[ix(N + 1, index)] = boundary === 1 ? -values[ix(N, index)] : values[ix(N, index)];
        values[ix(index, 0)] = boundary === 2 ? -values[ix(index, 1)] : values[ix(index, 1)];
        values[ix(index, N + 1)] = boundary === 2 ? -values[ix(index, N)] : values[ix(index, N)];
      }
      values[ix(0, 0)] = 0.5 * (values[ix(1, 0)] + values[ix(0, 1)]);
      values[ix(0, N + 1)] = 0.5 * (values[ix(1, N + 1)] + values[ix(0, N)]);
      values[ix(N + 1, 0)] = 0.5 * (values[ix(N, 0)] + values[ix(N + 1, 1)]);
      values[ix(N + 1, N + 1)] = 0.5 * (values[ix(N, N + 1)] + values[ix(N + 1, N)]);
    }

    function diffuse(boundary: number, values: Float32Array, previous: Float32Array, diffusion: number) {
      const amount = DT * diffusion * N * N;
      for (let iteration = 0; iteration < RELAXATION_STEPS; iteration += 1) {
        for (let row = 1; row <= N; row += 1) {
          for (let column = 1; column <= N; column += 1) {
            values[ix(column, row)] = (
              previous[ix(column, row)] +
              amount * (
                values[ix(column - 1, row)] +
                values[ix(column + 1, row)] +
                values[ix(column, row - 1)] +
                values[ix(column, row + 1)]
              )
            ) / (1 + 4 * amount);
          }
        }
        setBnd(boundary, values);
      }
    }

    function advect(
      boundary: number,
      density: Float32Array,
      previous: Float32Array,
      velocityX: Float32Array,
      velocityY: Float32Array,
    ) {
      const elapsed = DT * N;
      for (let row = 1; row <= N; row += 1) {
        for (let column = 1; column <= N; column += 1) {
          let x = column - elapsed * velocityX[ix(column, row)];
          let y = row - elapsed * velocityY[ix(column, row)];
          if (x < 0.5) x = 0.5;
          if (x > N + 0.5) x = N + 0.5;
          if (y < 0.5) y = 0.5;
          if (y > N + 0.5) y = N + 0.5;
          const x0 = Math.floor(x);
          const x1 = x0 + 1;
          const y0 = Math.floor(y);
          const y1 = y0 + 1;
          const right = x - x0;
          const left = 1 - right;
          const bottom = y - y0;
          const top = 1 - bottom;
          density[ix(column, row)] =
            left * (top * previous[ix(x0, y0)] + bottom * previous[ix(x0, y1)]) +
            right * (top * previous[ix(x1, y0)] + bottom * previous[ix(x1, y1)]);
        }
      }
      setBnd(boundary, density);
    }

    function project(
      velocityX: Float32Array,
      velocityY: Float32Array,
      pressure: Float32Array,
      divergence: Float32Array,
    ) {
      for (let row = 1; row <= N; row += 1) {
        for (let column = 1; column <= N; column += 1) {
          divergence[ix(column, row)] = -0.5 * (
            velocityX[ix(column + 1, row)] - velocityX[ix(column - 1, row)] +
            velocityY[ix(column, row + 1)] - velocityY[ix(column, row - 1)]
          ) / N;
          pressure[ix(column, row)] = 0;
        }
      }
      setBnd(0, divergence);
      setBnd(0, pressure);
      for (let iteration = 0; iteration < RELAXATION_STEPS; iteration += 1) {
        for (let row = 1; row <= N; row += 1) {
          for (let column = 1; column <= N; column += 1) {
            pressure[ix(column, row)] = (
              divergence[ix(column, row)] +
              pressure[ix(column - 1, row)] +
              pressure[ix(column + 1, row)] +
              pressure[ix(column, row - 1)] +
              pressure[ix(column, row + 1)]
            ) / 4;
          }
        }
        setBnd(0, pressure);
      }
      for (let row = 1; row <= N; row += 1) {
        for (let column = 1; column <= N; column += 1) {
          velocityX[ix(column, row)] -= 0.5 * N * (
            pressure[ix(column + 1, row)] - pressure[ix(column - 1, row)]
          );
          velocityY[ix(column, row)] -= 0.5 * N * (
            pressure[ix(column, row + 1)] - pressure[ix(column, row - 1)]
          );
        }
      }
      setBnd(1, velocityX);
      setBnd(2, velocityY);
    }

    function velocityStep() {
      [fields.u0, fields.u] = [fields.u, fields.u0];
      diffuse(1, fields.u, fields.u0, VISC);
      [fields.v0, fields.v] = [fields.v, fields.v0];
      diffuse(2, fields.v, fields.v0, VISC);
      project(fields.u, fields.v, fields.u0, fields.v0);
      [fields.u0, fields.u] = [fields.u, fields.u0];
      [fields.v0, fields.v] = [fields.v, fields.v0];
      advect(1, fields.u, fields.u0, fields.u0, fields.v0);
      advect(2, fields.v, fields.v0, fields.u0, fields.v0);
      project(fields.u, fields.v, fields.u0, fields.v0);
    }

    function weightedColor(): readonly [number, number, number] {
      const palette = paletteRef.current.length > 0 ? paletteRef.current : semanticDefaultPalette();
      const total = palette.reduce((sum, entry) => sum + entry.weight, 0);
      let random = Math.random() * total;
      let accumulated = 0;
      let chosen = palette[0];
      for (const entry of palette) {
        accumulated += entry.weight;
        if (random <= accumulated) {
          chosen = entry;
          break;
        }
      }
      const [red, green, blue] = hexToRgb(chosen.hex);
      return [red / 255, green / 255, blue / 255];
    }

    function injectAt(
      coordinateX: number,
      coordinateY: number,
      deltaX: number,
      deltaY: number,
      strength: number,
    ) {
      const column = Math.max(1, Math.min(N, Math.floor(coordinateX * N)));
      const row = Math.max(1, Math.min(N, Math.floor(coordinateY * N)));
      const index = ix(column, row);
      const energyScale = 0.65 + settingsRef.current.energy * 0.7;
      const scaledStrength = strength * energyScale;
      fields.u[index] += deltaX * scaledStrength;
      fields.v[index] += deltaY * scaledStrength;
      const [red, green, blue] = weightedColor();
      const amount = 90 * Math.min(1, scaledStrength * 4);
      fields.dR[index] += red * amount;
      fields.dG[index] += green * amount;
      fields.dB[index] += blue * amount;
      for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const neighbourX = column + offsetX;
        const neighbourY = row + offsetY;
        if (neighbourX < 1 || neighbourX > N || neighbourY < 1 || neighbourY > N) continue;
        const neighbour = ix(neighbourX, neighbourY);
        fields.dR[neighbour] += red * amount * 0.4;
        fields.dG[neighbour] += green * amount * 0.4;
        fields.dB[neighbour] += blue * amount * 0.4;
      }
    }

    function pointerMove(clientX: number, clientY: number) {
      const nextX = clientX / Math.max(1, window.innerWidth);
      const nextY = clientY / Math.max(1, window.innerHeight);
      if (pointerX !== null && pointerY !== null) {
        const deltaX = (nextX - pointerX) * N;
        const deltaY = (nextY - pointerY) * N;
        const speed = Math.min(1.6, Math.hypot(deltaX, deltaY) * 0.5);
        injectAt(nextX, nextY, deltaX, deltaY, 0.35 + speed);
      } else {
        injectAt(nextX, nextY, 0, -0.3, 0.5);
      }
      pointerX = nextX;
      pointerY = nextY;
    }

    function ambient(at = performance.now()) {
      const time = (at - startedAt) / 9000;
      for (let index = 0; index < 3; index += 1) {
        const x = 0.5 + 0.32 * Math.sin(time * 0.7 + index * 2.1);
        const y = 0.5 + 0.32 * Math.cos(time * 0.55 + index * 1.3);
        injectAt(x, y, Math.cos(time + index) * 0.5, Math.sin(time * 1.3 + index) * 0.5, 0.06);
      }
    }

    function advectDye() {
      fields.dR0.set(fields.dR);
      advect(1, fields.dR, fields.dR0, fields.u, fields.v);
      fields.dG0.set(fields.dG);
      advect(1, fields.dG, fields.dG0, fields.u, fields.v);
      fields.dB0.set(fields.dB);
      advect(1, fields.dB, fields.dB0, fields.u, fields.v);
    }

    function decay() {
      for (let index = 0; index < SIZE; index += 1) {
        fields.dR[index] *= 0.988;
        fields.dG[index] *= 0.988;
        fields.dB[index] *= 0.988;
      }
    }

    function renderDye() {
      if (!context || !offscreen || !offscreenContext || !frame) throw new Error("Aura canvas is unavailable.");
      const data = frame.data;
      const warmthValue = settingsRef.current.warmth;
      const redGain = 0.86 + warmthValue * 0.28;
      const blueGain = 1.14 - warmthValue * 0.28;
      for (let row = 0; row < STRIDE; row += 1) {
        for (let column = 0; column < STRIDE; column += 1) {
          const index = ix(column, row);
          const pixel = (row * STRIDE + column) * 4;
          const redDensity = Math.max(0, fields.dR[index] * redGain);
          const greenDensity = Math.max(0, fields.dG[index]);
          const blueDensity = Math.max(0, fields.dB[index] * blueGain);
          const peakDensity = Math.max(redDensity, greenDensity, blueDensity);

          if (peakDensity < 0.0001) {
            data[pixel] = 0;
            data[pixel + 1] = 0;
            data[pixel + 2] = 0;
            data[pixel + 3] = 0;
            continue;
          }

          // Preserve the learned hue as density builds instead of clipping each
          // channel to white. Exposure controls brightness; channel ratios keep
          // olive, rose, chocolate, and every learned colour recognisably itself.
          const normalisedRed = redDensity / peakDensity;
          const normalisedGreen = greenDensity / peakDensity;
          const normalisedBlue = blueDensity / peakDensity;
          const luminance = normalisedRed * 0.2126 + normalisedGreen * 0.7152 + normalisedBlue * 0.0722;
          const saturation = 1.12;
          const exposed = 1 - Math.exp(-peakDensity * 0.045);
          const channel = (value: number) => clamp(luminance + (value - luminance) * saturation);

          data[pixel] = Math.round(channel(normalisedRed) * exposed * 255);
          data[pixel + 1] = Math.round(channel(normalisedGreen) * exposed * 255);
          data[pixel + 2] = Math.round(channel(normalisedBlue) * exposed * 255);
          data[pixel + 3] = Math.round((1 - Math.exp(-peakDensity * 0.07)) * 214);
        }
      }
      offscreenContext.putImageData(frame, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() || DEFAULT_AURA_PALETTE[0].hex;
      context.fillRect(0, 0, width, height);
      const smoothingRadius = Math.max(5, 7.5 * pixelRatio);
      context.save();
      context.filter = `blur(${smoothingRadius}px) saturate(1.06)`;
      context.drawImage(
        offscreen,
        0,
        0,
        STRIDE,
        STRIDE,
        -smoothingRadius * 2,
        -smoothingRadius * 2,
        width + smoothingRadius * 4,
        height + smoothingRadius * 4,
      );
      context.restore();
    }

    function simulate(at: number) {
      ambient(at);
      velocityStep();
      advectDye();
      decay();
      renderDye();
    }

    function animate(frameAt: number) {
      if (destroyed || failed || document.hidden || motionQuery.matches) {
        frameHandle = null;
        return;
      }
      try {
        const delta = Math.min(50, Math.max(1, frameAt - previousFrameAt));
        previousFrameAt = frameAt;
        averageFrameMs = averageFrameMs * 0.965 + delta * 0.035;
        stableFrames += 1;
        if (averageFrameMs > 27 && stableFrames > 90) {
          report("adaptive");
          stableFrames = 0;
        } else if (averageFrameMs < 18.4 && stableFrames > 300) {
          report("live");
          stableFrames = 0;
        }
        simulate(frameAt);
        frameHandle = window.requestAnimationFrame(animate);
      } catch {
        fail();
      }
    }

    function start() {
      if (destroyed || failed || document.hidden || motionQuery.matches || frameHandle !== null) return;
      previousFrameAt = performance.now();
      frameHandle = window.requestAnimationFrame(animate);
    }

    function drawFrozen() {
      if (failed || destroyed || !motionQuery.matches) return;
      try {
        for (let index = 0; index < 24; index += 1) simulate(startedAt + index * 16.67);
        report("frozen");
      } catch {
        fail();
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!motionQuery.matches) pointerMove(event.clientX, event.clientY);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (motionQuery.matches) return;
      const touch = event.touches[0];
      if (touch) pointerMove(touch.clientX, touch.clientY);
    };
    const onPointerLeave = () => {
      pointerX = null;
      pointerY = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (motionQuery.matches) drawFrozen();
      else start();
    };
    const onMotionChange = () => {
      if (motionQuery.matches) {
        stop();
        drawFrozen();
      } else {
        report("live");
        start();
      }
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      fail();
    };

    report("starting");
    setFallback(false);

    if (forcedFallback) {
      setFallback(true);
      report("fallback");
      return;
    }

    try {
      context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Canvas 2D is unavailable.");
      offscreen = document.createElement("canvas");
      offscreen.width = STRIDE;
      offscreen.height = STRIDE;
      offscreenContext = offscreen.getContext("2d");
      if (!offscreenContext) throw new Error("Aura buffer canvas is unavailable.");
      frame = offscreenContext.createImageData(STRIDE, STRIDE);
      resize();
    } catch {
      fail();
      return;
    }

    redrawFrozenRef.current = drawFrozen;
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    motionQuery.addEventListener("change", onMotionChange);
    canvas.addEventListener("contextlost", onContextLost);

    if (motionQuery.matches) drawFrozen();
    else {
      report("live");
      start();
    }

    return () => {
      destroyed = true;
      redrawFrozenRef.current = null;
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchmove", onTouchMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
      canvas.removeEventListener("contextlost", onContextLost);
      context = null;
      offscreenContext = null;
      offscreen = null;
      frame = null;
    };
  }, [forcedFallback]);

  const fallbackStyle = {
    "--aura-one": profile.colours[0],
    "--aura-two": profile.colours[1],
    "--aura-three": profile.colours[2],
    "--aura-four": profile.colours[3],
  } as React.CSSProperties;

  return (
    <div
      className={`style-aura ${fallback ? "style-aura-fallback-active" : ""}`}
      style={fallbackStyle}
      aria-hidden="true"
      data-aura-status={fallback ? "fallback" : "fluid"}
    >
      <canvas ref={canvasRef} />
      <div className="style-aura-fallback" />
      <div className="style-aura-legibility" />
    </div>
  );
}
