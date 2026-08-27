import {
  FakeGeminiExplanationAdapter,
  FakeGeminiMultimodalAdapter,
  type MultimodalAnalyzer,
  type MultimodalRequestV1,
  type MultimodalResponseV1,
  type OutfitExplanationPort,
  type OutfitExplanationRequestV1,
  type OutfitExplanationV1,
} from "@yange/contracts";
import {
  analyzeWithCloud,
  createMediaUploadIntent,
  explainWithCloud,
  isCloudSyncConfigured,
  probeCloudRuntime,
} from "./cloudRuntime";
import { indexedDbMediaRepository } from "./media/mediaRepository";

export interface TestableMultimodalAnalyzer extends MultimodalAnalyzer {
  failNext(): void;
}

export interface TestableOutfitExplainer extends OutfitExplanationPort {
  failNext(): void;
}

export class RuntimeMultimodalAnalyzer implements TestableMultimodalAnalyzer {
  private readonly local = new FakeGeminiMultimodalAdapter({ latencyMs: 720 });
  private readonly uploadedAssets = new Set<string>();
  private failNextRequest = false;

  failNext(): void {
    this.failNextRequest = true;
  }

  async analyze(request: MultimodalRequestV1): Promise<MultimodalResponseV1> {
    if (this.failNextRequest) {
      this.failNextRequest = false;
      throw new Error("The image analysis service was intentionally paused for this resilience test.");
    }
    if (!isCloudSyncConfigured()) return this.local.analyze(request);
    const runtime = await probeCloudRuntime();
    if (runtime.configuration.mode === "local") return analyzeWithCloud(request);

    await Promise.all(request.images.map(async (image) => {
      const stored = await indexedDbMediaRepository.get(image.assetId);
      if (!stored) throw new Error(`Prepared image ${image.fileName} is no longer available.`);
      const uploadKey = `${image.assetId}:${stored.blob.size}:${image.mimeType}`;
      if (this.uploadedAssets.has(uploadKey)) return;
      const intent = await createMediaUploadIntent({
        assetId: image.assetId,
        mimeType: image.mimeType,
        byteLength: stored.blob.size,
      });
      const uploaded = await fetch(intent.uploadUrl, {
        method: "PUT",
        body: stored.blob,
        headers: intent.requiredHeaders,
      });
      if (!uploaded.ok) throw new Error(`Private upload failed with status ${uploaded.status}.`);
      this.uploadedAssets.add(uploadKey);
    }));
    try {
      return await analyzeWithCloud(request);
    } catch (cause) {
      if (cause instanceof Error && cause.message === "MEDIA_UPLOAD_INVALID") {
        request.images.forEach((image) => {
          for (const key of this.uploadedAssets) {
            if (key.startsWith(`${image.assetId}:`)) this.uploadedAssets.delete(key);
          }
        });
        throw new Error("One image arrived in an incompatible format. Replace it and try again.");
      }
      throw cause;
    }
  }
}

export class RuntimeOutfitExplainer implements TestableOutfitExplainer {
  private readonly local = new FakeGeminiExplanationAdapter({ latencyMs: 520 });
  private failNextRequest = false;

  failNext(): void {
    this.failNextRequest = true;
  }

  async explain(request: OutfitExplanationRequestV1): Promise<OutfitExplanationV1> {
    if (this.failNextRequest) {
      this.failNextRequest = false;
      throw new Error("The explanation service was intentionally paused for this resilience test.");
    }
    return isCloudSyncConfigured() ? explainWithCloud(request) : this.local.explain(request);
  }
}
