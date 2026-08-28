import {
  createMediaUploadIntent,
  isCloudSyncConfigured,
} from "../cloudRuntime";
import { inspectPreparedBlob, type StoredMediaAsset } from "./imagePipeline";
import { indexedDbMediaRepository } from "./mediaRepository";
import {
  CUTOUT_MODEL_SIZE,
  CUTOUT_DERIVATIVE_VERSION,
  MEDIA_ASSET_UPDATED_EVENT,
  cutoutAssetId,
  isReliableForegroundRatio,
  maskBounds,
  paddedSourceCrop,
  type CutoutMetrics,
  type CutoutWorkerRequest,
  type CutoutWorkerResponse,
} from "./garmentCutoutProtocol";

export type GarmentCutoutStatus = "idle" | "processing" | "ready" | "fallback";

export interface GarmentCutoutResult {
  asset: StoredMediaAsset;
  metrics: CutoutMetrics;
  cached: boolean;
}

interface PendingCutout {
  resolve(value: { mask: Uint8ClampedArray; metrics: CutoutMetrics }): void;
  reject(reason: Error): void;
  timeoutId: number;
}

const pending = new Map<string, PendingCutout>();
const inFlight = new Map<string, Promise<GarmentCutoutResult>>();
let worker: Worker | null = null;

function cutoutWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./garmentCutout.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event: MessageEvent<CutoutWorkerResponse>) => {
    const request = pending.get(event.data.requestId);
    if (!request) return;
    pending.delete(event.data.requestId);
    window.clearTimeout(request.timeoutId);
    if (event.data.type === "failed") {
      request.reject(new Error(event.data.message));
      return;
    }
    request.resolve({
      mask: new Uint8ClampedArray(event.data.mask),
      metrics: event.data.metrics,
    });
  });
  worker.addEventListener("error", () => {
    for (const request of pending.values()) {
      window.clearTimeout(request.timeoutId);
      request.reject(new Error("On-device cutout is unavailable."));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The clean wardrobe image could not be encoded.")),
      "image/webp",
      0.9,
    );
  });
}

async function modelPixels(source: Blob): Promise<{
  bitmap: ImageBitmap;
  rgba: Uint8ClampedArray;
}> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = CUTOUT_MODEL_SIZE;
  canvas.height = CUTOUT_MODEL_SIZE;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Image cutout is unavailable in this browser.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { bitmap, rgba: context.getImageData(0, 0, canvas.width, canvas.height).data };
}

function inferMask(rgba: Uint8ClampedArray): Promise<{
  mask: Uint8ClampedArray;
  metrics: CutoutMetrics;
}> {
  const requestId = crypto.randomUUID();
  const transferableRgba = new Uint8ClampedArray(rgba).buffer;
  const request: CutoutWorkerRequest = {
    type: "segment",
    requestId,
    rgba: transferableRgba,
    width: CUTOUT_MODEL_SIZE,
    height: CUTOUT_MODEL_SIZE,
    modelUrl: new URL("/models/u2netp.onnx", window.location.origin).href,
  };
  const promise = new Promise<{ mask: Uint8ClampedArray; metrics: CutoutMetrics }>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const request = pending.get(requestId);
      if (!request) return;
      pending.delete(requestId);
      request.reject(new Error("The clean wardrobe view took too long, so Yange kept the original."));
      worker?.terminate();
      worker = null;
    }, 45_000);
    pending.set(requestId, { resolve, reject, timeoutId });
  });
  try {
    cutoutWorker().postMessage(request, [request.rgba]);
  } catch (cause) {
    const queued = pending.get(requestId);
    if (queued) {
      pending.delete(requestId);
      window.clearTimeout(queued.timeoutId);
      queued.reject(cause instanceof Error ? cause : new Error("On-device cutout is unavailable."));
    }
  }
  return promise;
}

async function composeCutout(
  bitmap: ImageBitmap,
  mask: Uint8ClampedArray,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bounds = maskBounds(mask, CUTOUT_MODEL_SIZE, CUTOUT_MODEL_SIZE);
  if (!bounds) throw new Error("Yange could not find a garment-shaped foreground.");
  const crop = paddedSourceCrop(
    bounds,
    bitmap.width,
    bitmap.height,
    CUTOUT_MODEL_SIZE,
    CUTOUT_MODEL_SIZE,
  );

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = bitmap.width;
  sourceCanvas.height = bitmap.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) throw new Error("Transparent image composition is unavailable.");
  sourceContext.drawImage(bitmap, 0, 0);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = CUTOUT_MODEL_SIZE;
  maskCanvas.height = CUTOUT_MODEL_SIZE;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) throw new Error("Mask composition is unavailable.");
  const maskImage = maskContext.createImageData(CUTOUT_MODEL_SIZE, CUTOUT_MODEL_SIZE);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    maskImage.data[offset] = 255;
    maskImage.data[offset + 1] = 255;
    maskImage.data[offset + 2] = 255;
    maskImage.data[offset + 3] = mask[index];
  }
  maskContext.putImageData(maskImage, 0, 0);
  sourceContext.globalCompositeOperation = "destination-in";
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = "high";
  sourceContext.drawImage(maskCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = crop.width;
  outputCanvas.height = crop.height;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) throw new Error("Cutout cropping is unavailable.");
  outputContext.drawImage(
    sourceCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );
  return { blob: await canvasBlob(outputCanvas), width: crop.width, height: crop.height };
}

async function uploadDerivative(asset: StoredMediaAsset): Promise<void> {
  if (!isCloudSyncConfigured()) return;
  const intent = await createMediaUploadIntent(asset);
  const response = await fetch(intent.uploadUrl, {
    method: "PUT",
    headers: intent.requiredHeaders,
    body: asset.blob,
  });
  if (!response.ok) throw new Error(`Cutout upload returned ${response.status}.`);
}

async function createCutout(source: StoredMediaAsset): Promise<GarmentCutoutResult> {
  const derivativeId = cutoutAssetId(source.assetId);
  const cached = await indexedDbMediaRepository.get(derivativeId);
  if (cached) {
    return {
      asset: cached,
      cached: true,
      metrics: { foregroundRatio: 0, inferenceMs: 0 },
    };
  }

  const { bitmap, rgba } = await modelPixels(source.blob);
  try {
    const inference = await inferMask(rgba);
    if (!isReliableForegroundRatio(inference.metrics.foregroundRatio)) {
      throw new Error("The foreground estimate was not reliable enough to replace the original.");
    }
    const composed = await composeCutout(bitmap, inference.mask);
    const encoded = await inspectPreparedBlob(composed.blob);
    if (encoded.mimeType === "image/jpeg") throw new Error("This browser cannot preserve transparency.");
    const sourceStem = source.fileName.replace(/\.[^.]+$/, "").slice(0, 92);
    const asset: StoredMediaAsset = {
      assetId: derivativeId,
      kind: "garment",
      fileName: `${sourceStem}-clean.${encoded.extension}`,
      mimeType: encoded.mimeType,
      byteLength: composed.blob.size,
      originalBytes: source.originalBytes,
      width: composed.width,
      height: composed.height,
      createdAt: new Date().toISOString(),
      blob: composed.blob,
      derivativeOf: source.assetId,
      derivativeKind: CUTOUT_DERIVATIVE_VERSION,
    };
    await indexedDbMediaRepository.put(asset);
    window.dispatchEvent(new CustomEvent(MEDIA_ASSET_UPDATED_EVENT, { detail: { assetId: derivativeId } }));
    return { asset, metrics: inference.metrics, cached: false };
  } finally {
    bitmap.close();
  }
}

export async function ensureGarmentCutout(
  source: StoredMediaAsset,
  options: { syncCloud?: boolean } = {},
): Promise<GarmentCutoutResult> {
  if (source.kind !== "garment") throw new Error("Only garment photos receive presentation cutouts.");
  const existing = inFlight.get(source.assetId);
  const work = existing ?? createCutout(source).finally(() => inFlight.delete(source.assetId));
  if (!existing) inFlight.set(source.assetId, work);
  const result = await work;
  if (options.syncCloud) await uploadDerivative(result.asset);
  return result;
}

export function scheduleGarmentCutout(
  source: StoredMediaAsset,
  options: { syncCloud?: boolean } = {},
): Promise<GarmentCutoutResult> {
  return new Promise((resolve, reject) => {
    const run = () => void ensureGarmentCutout(source, options).then(resolve, reject);
    const idleCallback = window.requestIdleCallback;
    if (typeof idleCallback === "function") {
      idleCallback(run, { timeout: 500 });
    } else {
      setTimeout(run, 0);
    }
  });
}
