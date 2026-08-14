import { useEffect, useRef, useState } from "react";
import type { AnalysisImageKind } from "@yange/contracts";
import {
  createDemoImage,
  prepareImage,
  validateImageFile,
  type StoredMediaAsset,
} from "../../media/imagePipeline";
import { indexedDbMediaRepository } from "../../media/mediaRepository";

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
      if (previous.asset) await indexedDbMediaRepository.delete(previous.asset.assetId);
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

export function useMediaUrl(assetId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    if (!assetId) {
      setUrl(null);
      return () => undefined;
    }
    void indexedDbMediaRepository
      .get(assetId)
      .then((asset) => {
        if (!active || !asset) return;
        createdUrl = URL.createObjectURL(asset.blob);
        setUrl(createdUrl);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [assetId]);

  return url;
}
