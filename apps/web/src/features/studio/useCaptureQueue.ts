import { useEffect, useRef, useState } from "react";
import type { AnalysisImageKind } from "@yange/contracts";
import {
  createDemoImage,
  prepareImage,
  validateImageFile,
  type StoredMediaAsset,
} from "../../media/imagePipeline";
import { indexedDbMediaRepository } from "../../media/mediaRepository";
import { createMediaReadUrl, isCloudSyncConfigured } from "../../cloudRuntime";
import { cutoutAssetId, MEDIA_ASSET_UPDATED_EVENT } from "../../media/garmentCutoutProtocol";
import { scheduleGarmentCutout } from "../../media/garmentCutout";

export type CaptureStatus =
  | "empty"
  | "validating"
  | "compressing"
  | "ready"
  | "analyzing"
  | "failed";

export interface CaptureSlotState {
  kind: AnalysisImageKind;
  status: CaptureStatus;
  asset: StoredMediaAsset | null;
  previewUrl: string | null;
  error: string | null;
  attempt: number;
}

const captureKinds: AnalysisImageKind[] = [
  "garment",
  "care-label",
  "inspiration",
];

function emptySlot(kind: AnalysisImageKind): CaptureSlotState {
  return {
    kind,
    status: "empty",
    asset: null,
    previewUrl: null,
    error: null,
    attempt: 0,
  };
}

function initialSlots(): Record<AnalysisImageKind, CaptureSlotState> {
  return {
    garment: emptySlot("garment"),
    "care-label": emptySlot("care-label"),
    inspiration: emptySlot("inspiration"),
  };
}

export function useCaptureQueue() {
  const [slots, setSlots] = useState(initialSlots);
  const sourceFiles = useRef(new Map<AnalysisImageKind, File>());
  const generation = useRef(new Map<AnalysisImageKind, number>());
  const livePreviewUrls = useRef(new Set<string>());

  useEffect(
    () => () => {
      livePreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      livePreviewUrls.current.clear();
    },
    [],
  );

  function update(
    kind: AnalysisImageKind,
    next: Partial<CaptureSlotState> | ((slot: CaptureSlotState) => Partial<CaptureSlotState>),
  ) {
    setSlots((current) => {
      const slot = current[kind];
      const patch = typeof next === "function" ? next(slot) : next;
      return { ...current, [kind]: { ...slot, ...patch } };
    });
  }

  function revokePreview(url: string | null): void {
    if (!url) return;
    URL.revokeObjectURL(url);
    livePreviewUrls.current.delete(url);
  }

  async function process(kind: AnalysisImageKind, file: File): Promise<void> {
    const token = (generation.current.get(kind) ?? 0) + 1;
    generation.current.set(kind, token);
    sourceFiles.current.set(kind, file);
    const previous = slots[kind];

    try {
      if (previous.asset) {
        await indexedDbMediaRepository.delete(previous.asset.assetId);
        if (previous.kind === "garment") {
          await indexedDbMediaRepository.delete(cutoutAssetId(previous.asset.assetId));
        }
      }
      revokePreview(previous.previewUrl);
      update(kind, {
        status: "validating",
        asset: null,
        previewUrl: null,
        error: null,
        attempt: previous.attempt + 1,
      });
      await validateImageFile(file);
      if (generation.current.get(kind) !== token) return;
      update(kind, { status: "compressing" });
      const asset = await prepareImage(file, kind);
      if (generation.current.get(kind) !== token) return;
      await indexedDbMediaRepository.put(asset);
      const previewUrl = URL.createObjectURL(asset.blob);
      livePreviewUrls.current.add(previewUrl);
      update(kind, {
        status: "ready",
        asset,
        previewUrl,
        error: null,
      });
      // Cutout work begins after the private prepared copy is safely stored,
      // while the user is still reviewing or photographing the care label.
      // It never replaces or delays the original evidence sent to Gemini.
      if (kind === "garment") void scheduleGarmentCutout(asset).catch(() => undefined);
    } catch (cause) {
      if (generation.current.get(kind) !== token) return;
      update(kind, {
        status: "failed",
        error: cause instanceof Error ? cause.message : "Image preparation failed.",
      });
    }
  }

  async function retry(kind: AnalysisImageKind): Promise<void> {
    const file = sourceFiles.current.get(kind);
    if (file) await process(kind, file);
  }

  async function useDemo(kind: AnalysisImageKind): Promise<void> {
    try {
      const file = await createDemoImage(kind);
      await process(kind, file);
    } catch (cause) {
      update(kind, {
        status: "failed",
        error: cause instanceof Error ? cause.message : "Demo image could not be created.",
      });
    }
  }

  async function remove(kind: AnalysisImageKind, deleteAsset = true): Promise<void> {
    generation.current.set(kind, (generation.current.get(kind) ?? 0) + 1);
    const previous = slots[kind];
    try {
      if (deleteAsset && previous.asset) {
        await indexedDbMediaRepository.delete(previous.asset.assetId);
        if (kind === "garment") {
          await indexedDbMediaRepository.delete(cutoutAssetId(previous.asset.assetId));
        }
      }
    } catch (cause) {
      update(kind, {
        status: "failed",
        error: cause instanceof Error
          ? `The private image could not be removed: ${cause.message}`
          : "The private image could not be removed.",
      });
      return;
    }
    sourceFiles.current.delete(kind);
    revokePreview(previous.previewUrl);
    setSlots((current) => ({ ...current, [kind]: emptySlot(kind) }));
  }

  function setAnalysisStatus(
    kinds: AnalysisImageKind[],
    status: "analyzing" | "ready" | "failed",
    error: string | null = null,
  ): void {
    setSlots((current) => {
      const next = { ...current };
      for (const kind of kinds) {
        if (!next[kind].asset) continue;
        next[kind] = { ...next[kind], status, error };
      }
      return next;
    });
  }

  async function forget(kind: AnalysisImageKind): Promise<void> {
    await remove(kind, false);
  }

  return {
    slots,
    process,
    retry,
    useDemo,
    remove,
    forget,
    setAnalysisStatus,
  };
}

export type CaptureQueue = ReturnType<typeof useCaptureQueue>;

export function useMediaUrl(
  assetId: string | null,
  options: { cloudFallback?: boolean } = {},
): string | null {
  const cloudFallback = options.cloudFallback ?? true;
  const [url, setUrl] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    function onMediaUpdated(event: Event): void {
      const updatedAssetId = (event as CustomEvent<{ assetId?: string }>).detail?.assetId;
      if (updatedAssetId === assetId) setRevision((current) => current + 1);
    }
    window.addEventListener(MEDIA_ASSET_UPDATED_EVENT, onMediaUpdated);
    return () => window.removeEventListener(MEDIA_ASSET_UPDATED_EVENT, onMediaUpdated);
  }, [assetId]);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    if (!assetId) {
      setUrl(null);
      return () => undefined;
    }
    void indexedDbMediaRepository
      .get(assetId)
      .then(async (asset) => {
        if (!active) return;
        if (asset) {
          createdUrl = URL.createObjectURL(asset.blob);
          setUrl(createdUrl);
          return;
        }
        if (cloudFallback && isCloudSyncConfigured()) {
          const remote = await createMediaReadUrl(assetId);
          if (active) setUrl(remote.url);
        }
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [assetId, cloudFallback, revision]);

  return url;
}
