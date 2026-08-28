/// <reference lib="webworker" />

import * as ort from "onnxruntime-web/wasm";
import ortRuntimeUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import {
  foregroundRatio,
  normalizeMask,
  type CutoutWorkerRequest,
  type CutoutWorkerResponse,
  type CutoutWorkerSuccess,
} from "./garmentCutoutProtocol";

declare const self: DedicatedWorkerGlobalScope;

ort.env.logLevel = "error";
ort.env.wasm.numThreads = self.crossOriginIsolated
  ? Math.max(1, Math.min(4, self.navigator.hardwareConcurrency || 2))
  : 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = {
  mjs: new URL(ortRuntimeUrl, self.location.href).href,
  wasm: new URL(ortWasmUrl, self.location.href).href,
};

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let loadedModelUrl: string | null = null;

function sessionFor(modelUrl: string): Promise<ort.InferenceSession> {
  if (!sessionPromise || loadedModelUrl !== modelUrl) {
    loadedModelUrl = modelUrl;
    sessionPromise = ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
      enableCpuMemArena: true,
      enableMemPattern: true,
    });
  }
  return sessionPromise;
}

function imageTensor(rgba: Uint8ClampedArray, width: number, height: number): ort.Tensor {
  const pixels = width * height;
  if (rgba.length !== pixels * 4) throw new Error("The cutout input is incomplete.");
  const data = new Float32Array(pixels * 3);
  const means = [0.485, 0.456, 0.406] as const;
  const deviations = [0.229, 0.224, 0.225] as const;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      data[channel * pixels + pixel] = (rgba[pixel * 4 + channel] / 255 - means[channel]) / deviations[channel];
    }
  }
  return new ort.Tensor("float32", data, [1, 3, height, width]);
}

self.addEventListener("message", (event: MessageEvent<CutoutWorkerRequest>) => {
  if (event.data.type !== "segment") return;
  void (async () => {
    const { requestId, modelUrl, width, height } = event.data;
    try {
      const session = await sessionFor(modelUrl);
      const startedAt = performance.now();
      const input = imageTensor(new Uint8ClampedArray(event.data.rgba), width, height);
      const outputs = await session.run({ [session.inputNames[0]]: input });
      const firstOutput = outputs[session.outputNames[0]];
      if (!firstOutput || !(firstOutput.data instanceof Float32Array)) {
        throw new Error("The cutout model returned an unexpected mask.");
      }
      const mask = normalizeMask(firstOutput.data);
      const maskBuffer = mask.buffer as ArrayBuffer;
      const response: CutoutWorkerSuccess = {
        type: "complete",
        requestId,
        mask: maskBuffer,
        metrics: {
          inferenceMs: Math.round(performance.now() - startedAt),
          foregroundRatio: foregroundRatio(mask),
        },
      };
      self.postMessage(response, [maskBuffer]);
    } catch (cause) {
      sessionPromise = null;
      const response: CutoutWorkerResponse = {
        type: "failed",
        requestId,
        message: cause instanceof Error ? cause.message : "Garment cutout failed.",
      };
      self.postMessage(response);
    }
  })();
});

export {};
