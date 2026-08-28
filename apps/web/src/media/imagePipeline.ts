import type { AnalysisImageKind, AnalysisImageRef } from "@yange/contracts";

export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1600;
export const MAX_GARMENT_EDGE = 1280;

const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export class ImagePipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePipelineError";
  }
}

export interface StoredMediaAsset extends AnalysisImageRef {
  blob: Blob;
  originalBytes: number;
  createdAt: string;
  derivativeOf?: string;
  derivativeKind?: string;
}

export function scaledDimensions(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    throw new ImagePipelineError("The image dimensions are invalid.");
  }
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function extensionOf(fileName: string): string {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

export function detectedMime(bytes: Uint8Array): AnalysisImageRef["mimeType"] | null {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (isJpeg) return "image/jpeg";
  if (isPng) return "image/png";
  if (isWebp) return "image/webp";
  return null;
}

const extensionsByMime: Record<AnalysisImageRef["mimeType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function inspectPreparedBlob(blob: Blob): Promise<{
  mimeType: AnalysisImageRef["mimeType"];
  extension: string;
}> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const mimeType = detectedMime(header);
  if (!mimeType) {
    throw new ImagePipelineError("The browser produced an unsupported image copy.");
  }
  return { mimeType, extension: extensionsByMime[mimeType] };
}

export async function validateImageFile(file: File): Promise<void> {
  if (!allowedExtensions.has(extensionOf(file.name))) {
    throw new ImagePipelineError("Choose a JPEG, PNG, or WebP image.");
  }
  if (!allowedMimeTypes.has(file.type)) {
    throw new ImagePipelineError("The selected file does not report a supported image type.");
  }
  if (file.size <= 0) throw new ImagePipelineError("The selected image is empty.");
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImagePipelineError("This image is over 12 MB. Choose a smaller original.");
  }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const signatureMime = detectedMime(header);
  if (!signatureMime || signatureMime !== file.type) {
    throw new ImagePipelineError("The file signature does not match its image type.");
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ImagePipelineError("The browser could not rewrite this image."));
      },
      "image/webp",
      quality,
    );
  });
}

function safeDisplayName(fileName: string): string {
  const cleaned = fileName.replace(/[\\/\0-\x1f]/g, "-").trim();
  return (cleaned || "image").slice(0, 120);
}

export async function prepareImage(
  file: File,
  kind: AnalysisImageKind,
): Promise<StoredMediaAsset> {
  await validateImageFile(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImagePipelineError("This image could not be decoded. Try another copy.");
  }

  try {
    const dimensions = scaledDimensions(
      bitmap.width,
      bitmap.height,
      kind === "care-label" ? MAX_IMAGE_EDGE : MAX_GARMENT_EDGE,
    );
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new ImagePipelineError("Image processing is unavailable.");
    context.fillStyle = "#f3efe6";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const quality = kind === "care-label" ? 0.9 : 0.84;
    const blob = await canvasToBlob(canvas, quality);
    // Safari may silently return PNG when WebP canvas export is unavailable.
    // Trust the rewritten bytes, not the requested encoder, so Cloud Storage
    // metadata and the server-side signature check can never disagree.
    const output = await inspectPreparedBlob(blob);
    const id = `asset-${crypto.randomUUID()}`;
    return {
      assetId: id,
      kind,
      fileName: safeDisplayName(file.name.replace(/\.[^.]+$/, "")) + `.${output.extension}`,
      mimeType: output.mimeType,
      byteLength: blob.size,
      originalBytes: file.size,
      width: dimensions.width,
      height: dimensions.height,
      createdAt: new Date().toISOString(),
      blob,
    };
  } finally {
    bitmap.close();
  }
}

export async function createDemoImage(kind: AnalysisImageKind): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = kind === "care-label" ? 1100 : 900;
  canvas.height = kind === "care-label" ? 760 : 1180;
  const context = canvas.getContext("2d");
  if (!context) throw new ImagePipelineError("Demo image generation is unavailable.");

  if (kind === "care-label") {
    context.fillStyle = "#e9e4da";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#faf8f2";
    context.fillRect(120, 70, 860, 620);
    context.strokeStyle = "#c7c0b4";
    context.lineWidth = 3;
    context.strokeRect(120, 70, 860, 620);
    await document.fonts?.load('54px "Righteous"');
    const wordmarkGreen = context.createLinearGradient(190, 100, 190, 165);
    wordmarkGreen.addColorStop(0, "#4dbb79");
    wordmarkGreen.addColorStop(0.38, "#008653");
    wordmarkGreen.addColorStop(1, "#003c32");
    context.fillStyle = wordmarkGreen;
    context.font = '54px "Righteous", system-ui';
    context.fillText("Yange", 190, 155);
    context.fillStyle = "#8b6720";
    context.font = "700 20px system-ui";
    context.fillText("SAMPLE CARE LABEL", 390, 150);
    context.fillStyle = "#242522";
    context.font = "32px system-ui";
    context.fillText("55% LINEN · 45% COTTON", 190, 230);
    context.fillText("MACHINE WASH COLD", 190, 305);
    context.fillText("LINE DRY IN SHADE", 190, 370);
    context.fillText("LOW IRON · DO NOT BLEACH", 190, 435);
    context.fillStyle = "#6d725f";
    context.font = "26px system-ui";
    context.fillText("Sample label. Replace with your own photo.", 190, 600);
  } else {
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, kind === "inspiration" ? "#e6d8ba" : "#d28a63");
    gradient.addColorStop(1, kind === "inspiration" ? "#536148" : "#7d4434");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(20, 21, 19, 0.13)";
    context.beginPath();
    context.ellipse(450, 1080, 300, 48, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f0dcc6";
    context.beginPath();
    context.moveTo(280, 210);
    context.lineTo(360, 145);
    context.lineTo(540, 145);
    context.lineTo(620, 210);
    context.lineTo(690, 510);
    context.lineTo(575, 545);
    context.lineTo(560, 960);
    context.lineTo(340, 960);
    context.lineTo(325, 545);
    context.lineTo(210, 510);
    context.closePath();
    context.fill();
    context.fillStyle = "rgba(68, 77, 56, 0.82)";
    context.fillRect(340, 505, 220, 28);
    context.fillStyle = "#191b19";
    context.font = "700 28px system-ui";
    context.fillText(kind === "inspiration" ? "INSPIRATION LOOK" : "GARMENT CAPTURE", 44, 70);
    context.font = "24px system-ui";
    context.fillText("Built-in Phase 2 demo image", 44, 108);
  }

  const blob = await canvasToBlob(canvas, 0.92);
  const fileName =
    kind === "care-label"
      ? "sample-care-label.webp"
      : kind === "inspiration"
        ? "sample-inspiration.webp"
        : "sample-garment.webp";
  return new File([blob], fileName, { type: "image/webp" });
}
