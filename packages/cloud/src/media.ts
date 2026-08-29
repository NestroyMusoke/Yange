import { Storage } from "@google-cloud/storage";

export type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface MediaUploadIntent {
  assetId: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}

export interface PrivateMediaStore {
  createUploadIntent(
    userId: string,
    assetId: string,
    mimeType: SupportedImageMimeType,
    byteLength: number,
  ): Promise<MediaUploadIntent>;
  createReadUrl(userId: string, assetId: string): Promise<{ url: string; expiresAt: string }>;
  readBytes(userId: string, assetId: string): Promise<Buffer>;
  delete(userId: string, assetId: string): Promise<void>;
  createTemporaryUploadIntent(
    userId: string,
    assetId: string,
    mimeType: "image/jpeg" | "image/png",
    byteLength: number,
  ): Promise<MediaUploadIntent>;
  createTemporaryReadUrl(userId: string, assetId: string): Promise<{ url: string; expiresAt: string }>;
  readTemporaryBytes(userId: string, assetId: string): Promise<Buffer>;
  writeTemporary(
    userId: string,
    assetId: string,
    bytes: Buffer,
    mimeType: "image/jpeg" | "image/png",
  ): Promise<void>;
  deleteTemporary(userId: string, assetId: string): Promise<void>;
}

function safeId(value: string, label: string): void {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(value)) throw new Error(`${label} is invalid.`);
}

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

function hasExpectedSignature(bytes: Buffer, mimeType: SupportedImageMimeType): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

export class GoogleCloudStorageMediaStore implements PrivateMediaStore {
  private readonly bucket;

  constructor(storage: Storage, bucketName: string, private readonly now = () => Date.now()) {
    this.bucket = storage.bucket(bucketName);
  }

  private key(userId: string, assetId: string): string {
    safeId(userId, "User ID");
    safeId(assetId, "Asset ID");
    return `users/${userId}/assets/${assetId}`;
  }

  private temporaryKey(userId: string, assetId: string): string {
    safeId(userId, "User ID");
    safeId(assetId, "Asset ID");
    return `temporary/users/${userId}/assets/${assetId}`;
  }

  private async uploadIntent(
    objectKey: string,
    assetId: string,
    mimeType: SupportedImageMimeType,
    byteLength: number,
  ): Promise<MediaUploadIntent> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new Error("Only JPEG, PNG, and WebP uploads are accepted.");
    }
    if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > MAX_MEDIA_BYTES) {
      throw new Error("Media uploads must be between 1 byte and 8 MiB.");
    }
    const expires = this.now() + 10 * 60_000;
    const [uploadUrl] = await this.bucket.file(objectKey).getSignedUrl({
      version: "v4",
      action: "write",
      expires,
      contentType: mimeType,
    });
    return {
      assetId,
      objectKey,
      uploadUrl,
      expiresAt: new Date(expires).toISOString(),
      requiredHeaders: { "Content-Type": mimeType },
    };
  }

  async createUploadIntent(
    userId: string,
    assetId: string,
    mimeType: SupportedImageMimeType,
    byteLength: number,
  ): Promise<MediaUploadIntent> {
    return this.uploadIntent(this.key(userId, assetId), assetId, mimeType, byteLength);
  }

  createTemporaryUploadIntent(
    userId: string,
    assetId: string,
    mimeType: "image/jpeg" | "image/png",
    byteLength: number,
  ): Promise<MediaUploadIntent> {
    return this.uploadIntent(this.temporaryKey(userId, assetId), assetId, mimeType, byteLength);
  }

  async createReadUrl(userId: string, assetId: string): Promise<{ url: string; expiresAt: string }> {
    const expires = this.now() + 5 * 60_000;
    const { file } = await this.validatedFile(userId, assetId);
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires,
    });
    return { url, expiresAt: new Date(expires).toISOString() };
  }

  async createTemporaryReadUrl(userId: string, assetId: string): Promise<{ url: string; expiresAt: string }> {
    const expires = this.now() + 5 * 60_000;
    const { file } = await this.validatedFileByKey(this.temporaryKey(userId, assetId));
    const [url] = await file.getSignedUrl({ version: "v4", action: "read", expires });
    return { url, expiresAt: new Date(expires).toISOString() };
  }

  async readBytes(userId: string, assetId: string): Promise<Buffer> {
    const { file, mimeType } = await this.validatedFile(userId, assetId);
    const [bytes] = await file.download();
    if (bytes.length > MAX_MEDIA_BYTES || !hasExpectedSignature(bytes, mimeType)) {
      throw new Error("Stored media failed binary signature validation.");
    }
    return bytes;
  }

  async readTemporaryBytes(userId: string, assetId: string): Promise<Buffer> {
    const { file, mimeType } = await this.validatedFileByKey(this.temporaryKey(userId, assetId));
    const [bytes] = await file.download();
    if (bytes.length > MAX_MEDIA_BYTES || !hasExpectedSignature(bytes, mimeType)) {
      throw new Error("Stored media failed binary signature validation.");
    }
    return bytes;
  }

  private async validatedFile(userId: string, assetId: string) {
    return this.validatedFileByKey(this.key(userId, assetId));
  }

  private async validatedFileByKey(objectKey: string) {
    const file = this.bucket.file(objectKey);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    const mimeType = metadata.contentType;
    if (!Number.isFinite(size) || size < 1 || size > MAX_MEDIA_BYTES) {
      throw new Error("Stored media exceeds Yange's 8 MiB safety limit.");
    }
    if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp") {
      throw new Error("Stored media has an unsupported content type.");
    }
    return { file, mimeType: mimeType as SupportedImageMimeType };
  }

  async delete(userId: string, assetId: string): Promise<void> {
    await this.bucket.file(this.key(userId, assetId)).delete({ ignoreNotFound: true });
  }


  async writeTemporary(
    userId: string,
    assetId: string,
    bytes: Buffer,
    mimeType: "image/jpeg" | "image/png",
  ): Promise<void> {
    if (bytes.length < 1 || bytes.length > MAX_MEDIA_BYTES || !hasExpectedSignature(bytes, mimeType)) {
      throw new Error("Generated media failed binary signature validation.");
    }
    await this.bucket.file(this.temporaryKey(userId, assetId)).save(bytes, {
      resumable: false,
      contentType: mimeType,
      metadata: { cacheControl: "private, no-store, max-age=0" },
    });
  }

  async deleteTemporary(userId: string, assetId: string): Promise<void> {
    await this.bucket.file(this.temporaryKey(userId, assetId)).delete({ ignoreNotFound: true });
  }
}

export function createGoogleMediaStore(projectId: string, bucketName: string) {
  return new GoogleCloudStorageMediaStore(new Storage({ projectId }), bucketName);
}
