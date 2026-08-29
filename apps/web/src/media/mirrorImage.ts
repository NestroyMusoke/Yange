import { scaledDimensions, validateImageFile } from "./imagePipeline";

const MIRROR_MAX_EDGE = 1_920;
const MIRROR_MIN_EDGE = 320;

export interface PreparedMirrorPerson {
  assetId: string;
  mimeType: "image/jpeg";
  byteLength: number;
  width: number;
  height: number;
  blob: Blob;
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The Mirror photo could not be prepared.")),
      "image/jpeg",
      0.91,
    );
  });
}

export async function prepareMirrorPerson(file: File): Promise<PreparedMirrorPerson> {
  await validateImageFile(file);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const dimensions = scaledDimensions(bitmap.width, bitmap.height, MIRROR_MAX_EDGE);
    if (Math.min(dimensions.width, dimensions.height) < MIRROR_MIN_EDGE) {
      throw new Error("Choose a clearer photo that is at least 320 pixels on each side.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Mirror image preparation is unavailable in this browser.");
    context.fillStyle = "#f3efe6";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasJpeg(canvas);
    if (blob.size > 7 * 1024 * 1024) {
      throw new Error("The prepared photo is still too large. Choose a smaller original.");
    }
    return {
      assetId: `mirror-person-${crypto.randomUUID()}`,
      mimeType: "image/jpeg",
      byteLength: blob.size,
      width: dimensions.width,
      height: dimensions.height,
      blob,
    };
  } finally {
    bitmap.close();
  }
}
