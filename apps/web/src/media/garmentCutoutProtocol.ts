export const CUTOUT_MODEL_SIZE = 320;
export const CUTOUT_DERIVATIVE_VERSION = "u2netp-v1";
export const MEDIA_ASSET_UPDATED_EVENT = "yange:media-asset-updated";

export interface CutoutMetrics {
  inferenceMs: number;
  foregroundRatio: number;
}

export interface CutoutWorkerRequest {
  type: "segment";
  requestId: string;
  rgba: ArrayBuffer;
  width: number;
  height: number;
  modelUrl: string;
}

export interface CutoutWorkerSuccess {
  type: "complete";
  requestId: string;
  mask: ArrayBuffer;
  metrics: CutoutMetrics;
}

export interface CutoutWorkerFailure {
  type: "failed";
  requestId: string;
  message: string;
}

export type CutoutWorkerResponse = CutoutWorkerSuccess | CutoutWorkerFailure;

export interface MaskBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cutoutAssetId(sourceAssetId: string): string {
  return `${sourceAssetId}--cutout-${CUTOUT_DERIVATIVE_VERSION}`;
}

export function normalizeMask(values: Float32Array): Uint8ClampedArray {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  const range = maximum - minimum;
  if (!Number.isFinite(range) || range < 1e-7) {
    return new Uint8ClampedArray(values.length);
  }

  const mask = new Uint8ClampedArray(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const normalized = Math.max(0, Math.min(1, (values[index] - minimum) / range));
    // A soft smoothstep suppresses low-confidence background without creating
    // the brittle, sticker-like edges produced by a hard threshold.
    const edge = Math.max(0, Math.min(1, (normalized - 0.04) / 0.9));
    const smoothed = edge * edge * (3 - 2 * edge);
    mask[index] = Math.round(smoothed * 255);
  }
  return mask;
}

export function foregroundRatio(mask: Uint8ClampedArray, threshold = 128): number {
  if (!mask.length) return 0;
  let foreground = 0;
  for (const alpha of mask) if (alpha >= threshold) foreground += 1;
  return foreground / mask.length;
}

export function isReliableForegroundRatio(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio >= 0.015 && ratio <= 0.985;
}

export function maskBounds(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 18,
): MaskBounds | null {
  if (mask.length !== width * height || width < 1 || height < 1) return null;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] < threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function paddedSourceCrop(
  bounds: MaskBounds,
  sourceWidth: number,
  sourceHeight: number,
  maskWidth: number,
  maskHeight: number,
  paddingRatio = 0.06,
): MaskBounds {
  const scaleX = sourceWidth / maskWidth;
  const scaleY = sourceHeight / maskHeight;
  const paddingX = Math.round(bounds.width * scaleX * paddingRatio);
  const paddingY = Math.round(bounds.height * scaleY * paddingRatio);
  const x = Math.max(0, Math.floor(bounds.x * scaleX) - paddingX);
  const y = Math.max(0, Math.floor(bounds.y * scaleY) - paddingY);
  const right = Math.min(sourceWidth, Math.ceil((bounds.x + bounds.width) * scaleX) + paddingX);
  const bottom = Math.min(sourceHeight, Math.ceil((bounds.y + bounds.height) * scaleY) + paddingY);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}
