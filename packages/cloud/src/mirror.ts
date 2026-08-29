import { createHash } from "node:crypto";
import { Firestore, type DocumentData } from "@google-cloud/firestore";
import { CloudTasksClient, protos } from "@google-cloud/tasks";
import { GoogleAuth } from "google-auth-library";
import sharp from "sharp";
import {
  MIRROR_CONTRACT_VERSION,
  MIRROR_MODEL_ID,
  type CreateMirrorJobRequestV1,
  type MirrorFailureCode,
  type MirrorJobV1,
} from "@yange/contracts";
import type { PrivateMediaStore } from "./media";

export const MIRROR_DAILY_LIMIT = 4;

export interface MirrorJobRecord extends MirrorJobV1 {
  cacheKey: string;
}

export interface MirrorJobRepository {
  createOrReuse(
    userId: string,
    job: MirrorJobRecord,
    dailyLimit?: number,
  ): Promise<{ job: MirrorJobRecord; reused: boolean; rateLimited: boolean }>;
  read(userId: string, jobId: string): Promise<MirrorJobRecord | null>;
  update(userId: string, jobId: string, update: Partial<MirrorJobRecord>): Promise<MirrorJobRecord>;
}

function assertId(value: string, label: string): void {
  if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(value)) throw new Error(`${label} is invalid.`);
}

function dayKey(value: string): string {
  return value.slice(0, 10).replaceAll("-", "");
}

export class InMemoryMirrorJobRepository implements MirrorJobRepository {
  private readonly jobs = new Map<string, Map<string, MirrorJobRecord>>();
  private readonly cache = new Map<string, Map<string, string>>();
  private readonly quotas = new Map<string, Map<string, number>>();

  private partition(userId: string): Map<string, MirrorJobRecord> {
    const current = this.jobs.get(userId) ?? new Map<string, MirrorJobRecord>();
    this.jobs.set(userId, current);
    return current;
  }

  async createOrReuse(
    userId: string,
    job: MirrorJobRecord,
    dailyLimit = MIRROR_DAILY_LIMIT,
  ): Promise<{ job: MirrorJobRecord; reused: boolean; rateLimited: boolean }> {
    const jobs = this.partition(userId);
    const duplicate = jobs.get(job.id);
    if (duplicate) return { job: structuredClone(duplicate), reused: true, rateLimited: false };
    const cache = this.cache.get(userId) ?? new Map<string, string>();
    this.cache.set(userId, cache);
    const cachedId = cache.get(job.cacheKey);
    const cached = cachedId ? jobs.get(cachedId) : null;
    if (cached?.status === "ready") return { job: structuredClone(cached), reused: true, rateLimited: false };
    const quotas = this.quotas.get(userId) ?? new Map<string, number>();
    this.quotas.set(userId, quotas);
    const key = dayKey(job.createdAt);
    const used = quotas.get(key) ?? 0;
    if (used >= dailyLimit) return { job: structuredClone(job), reused: false, rateLimited: true };
    quotas.set(key, used + 1);
    jobs.set(job.id, structuredClone(job));
    return { job: structuredClone(job), reused: false, rateLimited: false };
  }

  async read(userId: string, jobId: string): Promise<MirrorJobRecord | null> {
    return structuredClone(this.partition(userId).get(jobId) ?? null);
  }

  async update(userId: string, jobId: string, update: Partial<MirrorJobRecord>): Promise<MirrorJobRecord> {
    const jobs = this.partition(userId);
    const current = jobs.get(jobId);
    if (!current) throw new Error("Mirror job does not exist.");
    if (current.status === "deleted" && update.status !== "deleted") return structuredClone(current);
    const next = { ...current, ...structuredClone(update) };
    jobs.set(jobId, next);
    if (next.status === "ready") {
      const cache = this.cache.get(userId) ?? new Map<string, string>();
      cache.set(next.cacheKey, next.id);
      this.cache.set(userId, cache);
    }
    return structuredClone(next);
  }
}

interface MirrorCacheDocument { jobId: string; updatedAt: string }
interface MirrorQuotaDocument { count: number; updatedAt: string }

export class FirestoreMirrorJobRepository implements MirrorJobRepository {
  constructor(private readonly firestore: Firestore) {}

  private user(userId: string) {
    assertId(userId, "User ID");
    return this.firestore.collection("users").doc(userId);
  }

  async createOrReuse(
    userId: string,
    job: MirrorJobRecord,
    dailyLimit = MIRROR_DAILY_LIMIT,
  ): Promise<{ job: MirrorJobRecord; reused: boolean; rateLimited: boolean }> {
    assertId(job.id, "Mirror job ID");
    const user = this.user(userId);
    const jobRef = user.collection("mirrorJobs").doc(job.id);
    const cacheRef = user.collection("mirrorControl").doc(`cache-${job.cacheKey}`);
    const quotaRef = user.collection("mirrorControl").doc(`quota-${dayKey(job.createdAt)}`);
    return this.firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(jobRef);
      if (existing.exists) {
        return { job: existing.data() as MirrorJobRecord, reused: true, rateLimited: false };
      }
      const cacheSnapshot = await transaction.get(cacheRef);
      if (cacheSnapshot.exists) {
        const cachedId = (cacheSnapshot.data() as MirrorCacheDocument).jobId;
        const cachedRef = user.collection("mirrorJobs").doc(cachedId);
        const cachedSnapshot = await transaction.get(cachedRef);
        if (cachedSnapshot.exists) {
          const cached = cachedSnapshot.data() as MirrorJobRecord;
          if (cached.status === "ready") return { job: cached, reused: true, rateLimited: false };
        }
      }
      const quotaSnapshot = await transaction.get(quotaRef);
      const quota = quotaSnapshot.exists
        ? quotaSnapshot.data() as MirrorQuotaDocument
        : { count: 0, updatedAt: job.createdAt };
      if (quota.count >= dailyLimit) {
        return { job, reused: false, rateLimited: true };
      }
      transaction.set(jobRef, structuredClone(job) as unknown as DocumentData);
      transaction.set(quotaRef, { count: quota.count + 1, updatedAt: job.createdAt });
      transaction.set(user, { updatedAt: job.createdAt, schemaVersion: 1 }, { merge: true });
      return { job, reused: false, rateLimited: false };
    });
  }

  async read(userId: string, jobId: string): Promise<MirrorJobRecord | null> {
    assertId(jobId, "Mirror job ID");
    const snapshot = await this.user(userId).collection("mirrorJobs").doc(jobId).get();
    return snapshot.exists ? structuredClone(snapshot.data() as MirrorJobRecord) : null;
  }

  async update(userId: string, jobId: string, update: Partial<MirrorJobRecord>): Promise<MirrorJobRecord> {
    assertId(jobId, "Mirror job ID");
    const user = this.user(userId);
    const reference = user.collection("mirrorJobs").doc(jobId);
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new Error("Mirror job does not exist.");
      const current = snapshot.data() as MirrorJobRecord;
      if (current.status === "deleted" && update.status !== "deleted") return current;
      const next = { ...current, ...structuredClone(update) };
      transaction.set(reference, next as unknown as DocumentData);
      if (next.status === "ready") {
        transaction.set(user.collection("mirrorControl").doc(`cache-${next.cacheKey}`), {
          jobId: next.id,
          updatedAt: next.updatedAt,
        } satisfies MirrorCacheDocument);
      }
      return next;
    });
  }
}

export function createFirestoreMirrorJobRepository(projectId: string, databaseId = "(default)") {
  return new FirestoreMirrorJobRepository(new Firestore({ projectId, databaseId }));
}

export function mirrorCacheKey(
  userId: string,
  personAssetId: string,
  garmentAssetId: string,
  model = MIRROR_MODEL_ID,
): string {
  return createHash("sha256")
    .update([userId, personAssetId, garmentAssetId, model].join("\0"))
    .digest("hex");
}

export function createMirrorJob(
  userId: string,
  request: CreateMirrorJobRequestV1,
  processingRegion: string,
): MirrorJobRecord {
  return {
    contractVersion: MIRROR_CONTRACT_VERSION,
    id: `mirror-${request.requestId}`,
    requestId: request.requestId,
    outfitCandidateId: request.outfitCandidateId,
    garment: structuredClone(request.garment),
    personAssetId: request.personImage.assetId,
    resultAssetId: null,
    status: "queued",
    model: MIRROR_MODEL_ID,
    processingRegion,
    createdAt: request.requestedAt,
    updatedAt: request.requestedAt,
    completedAt: null,
    personDeletedAt: null,
    cached: false,
    attempts: 0,
    failure: null,
    notices: [
      "AI visualization, not a fit guarantee.",
      "Yange Mirror never changes Personal Match, Style Aura, or wardrobe state.",
      `Private generation is processed in ${processingRegion}; the person photo is deleted after the attempt.`,
    ],
    cacheKey: mirrorCacheKey(userId, request.personImage.assetId, request.garment.assetId),
  };
}

export interface VirtualTryOnResult { bytes: Buffer; mimeType: "image/png" }
export interface VirtualTryOnGenerator {
  generate(input: { personBytes: Buffer; garmentBytes: Buffer }): Promise<VirtualTryOnResult>;
}

export interface CloudAccessTokenProvider { accessToken(): Promise<string> }

export class GoogleCloudAccessTokenProvider implements CloudAccessTokenProvider {
  constructor(private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  })) {}

  async accessToken(): Promise<string> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error("Google Cloud access token is unavailable.");
    return token;
  }
}

function hasPngSignature(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

export class GoogleVirtualTryOnGenerator implements VirtualTryOnGenerator {
  constructor(private readonly options: {
    projectId: string;
    location: string;
    tokenProvider: CloudAccessTokenProvider;
    fetchImpl?: typeof fetch;
  }) {}

  async generate(input: { personBytes: Buffer; garmentBytes: Buffer }): Promise<VirtualTryOnResult> {
    const [person, garment] = await Promise.all([
      sharp(input.personBytes).rotate().jpeg({ quality: 91, chromaSubsampling: "4:4:4" }).toBuffer(),
      sharp(input.garmentBytes).rotate().jpeg({ quality: 91, chromaSubsampling: "4:4:4" }).toBuffer(),
    ]);
    if (person.length > 7 * 1024 * 1024 || garment.length > 7 * 1024 * 1024) {
      throw new Error("Mirror input exceeded the model's 7 MB image limit.");
    }
    const token = await this.options.tokenProvider.accessToken();
    const endpoint = `https://${this.options.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(this.options.projectId)}/locations/${encodeURIComponent(this.options.location)}/publishers/google/models/${MIRROR_MODEL_ID}:predict`;
    const response = await (this.options.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{
          personImage: { image: { bytesBase64Encoded: person.toString("base64") } },
          productImages: [{ image: { bytesBase64Encoded: garment.toString("base64") } }],
        }],
        parameters: {
          sampleCount: 1,
          personGeneration: "allow_adult",
          safetySetting: "block_medium_and_above",
          addWatermark: true,
          outputOptions: { mimeType: "image/png" },
        },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 600);
      throw new Error(`Virtual Try-On request failed with ${response.status}: ${detail}`);
    }
    const body = await response.json() as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
    };
    const encoded = body.predictions?.[0]?.bytesBase64Encoded;
    if (!encoded) throw new Error("Virtual Try-On returned no image.");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length > 8 * 1024 * 1024 || !hasPngSignature(bytes)) {
      throw new Error("Virtual Try-On returned an invalid image.");
    }
    return { bytes, mimeType: "image/png" };
  }
}

export interface MirrorTaskRequest { userId: string; jobId: string }
export interface MirrorTaskScheduler {
  enqueue(request: MirrorTaskRequest): Promise<{ taskName: string; deduplicated: boolean }>;
}

export class GoogleCloudTasksMirrorScheduler implements MirrorTaskScheduler {
  constructor(private readonly client: CloudTasksClient, private readonly options: {
    projectId: string;
    location: string;
    queue: string;
    workerUrl: string;
    serviceAccountEmail: string;
  }) {}

  async enqueue(request: MirrorTaskRequest): Promise<{ taskName: string; deduplicated: boolean }> {
    assertId(request.userId, "User ID");
    assertId(request.jobId, "Mirror job ID");
    const parent = this.client.queuePath(this.options.projectId, this.options.location, this.options.queue);
    const taskId = `${request.userId}-${request.jobId}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 400);
    if (!taskId) throw new Error("Mirror request did not produce a valid task ID.");
    const name = `${parent}/tasks/${taskId}`;
    const task: protos.google.cloud.tasks.v2.ITask = {
      name,
      httpRequest: {
        httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
        url: `${this.options.workerUrl.replace(/\/$/, "")}/internal/mirror/generate`,
        headers: { "Content-Type": "application/json", "X-Yange-User": request.userId },
        body: Buffer.from(JSON.stringify(request)),
        oidcToken: {
          serviceAccountEmail: this.options.serviceAccountEmail,
          audience: this.options.workerUrl,
        },
      },
    };
    try {
      const [created] = await this.client.createTask({ parent, task });
      return { taskName: created.name ?? name, deduplicated: false };
    } catch (cause) {
      if ((cause as { code?: number }).code === 6) return { taskName: name, deduplicated: true };
      throw cause;
    }
  }
}

export function createGoogleMirrorTaskScheduler(
  options: ConstructorParameters<typeof GoogleCloudTasksMirrorScheduler>[1],
) {
  return new GoogleCloudTasksMirrorScheduler(new CloudTasksClient(), options);
}

function failureFor(cause: unknown): { code: MirrorFailureCode; message: string } {
  const message = cause instanceof Error ? cause.message : "Mirror generation failed.";
  if (/safety|blocked|minor|person generation/i.test(message)) {
    return { code: "SAFETY_BLOCKED", message: "This image could not be processed under Yange Mirror's adult safety policy." };
  }
  if (/not found|unavailable|no such object|input/i.test(message)) {
    return { code: "INPUT_UNAVAILABLE", message: "One of the private source images is no longer available." };
  }
  if (/invalid image|no image/i.test(message)) {
    return { code: "OUTPUT_INVALID", message: "The model did not return a usable preview." };
  }
  if (/request failed|token|timeout|fetch/i.test(message)) {
    return { code: "MODEL_UNAVAILABLE", message: "The preview service is temporarily unavailable." };
  }
  return { code: "UNKNOWN", message: "The preview could not be completed safely." };
}

export async function runMirrorJob(
  request: MirrorTaskRequest,
  dependencies: {
    jobs: MirrorJobRepository;
    media: PrivateMediaStore;
    generator: VirtualTryOnGenerator;
    now?: () => string;
  },
): Promise<MirrorJobRecord> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const existing = await dependencies.jobs.read(request.userId, request.jobId);
  if (!existing) throw new Error("Mirror job does not exist.");
  if (["ready", "blocked", "deleted"].includes(existing.status)) return existing;
  if (existing.status === "failed" && existing.attempts >= 3) return existing;
  let job = await dependencies.jobs.update(request.userId, request.jobId, {
    status: "generating",
    updatedAt: now(),
    attempts: existing.attempts + 1,
    failure: null,
  });
  if (job.status === "deleted") return job;
  try {
    const [personBytes, garmentBytes] = await Promise.all([
      dependencies.media.readTemporaryBytes(request.userId, job.personAssetId),
      dependencies.media.readBytes(request.userId, job.garment.assetId),
    ]);
    const generated = await dependencies.generator.generate({ personBytes, garmentBytes });
    const resultAssetId = `mirror-result-${job.id}`;
    await dependencies.media.writeTemporary(
      request.userId,
      resultAssetId,
      generated.bytes,
      generated.mimeType,
    );
    await dependencies.media.deleteTemporary(request.userId, job.personAssetId);
    const completedAt = now();
    job = await dependencies.jobs.update(request.userId, request.jobId, {
      status: "ready",
      resultAssetId,
      updatedAt: completedAt,
      completedAt,
      personDeletedAt: completedAt,
      cached: false,
      failure: null,
    });
    // A person can delete the preview while the remote model is still running.
    // Repository updates never resurrect a deleted job, and this removes the
    // just-created result if deletion won that race.
    if (job.status === "deleted") {
      await dependencies.media.deleteTemporary(request.userId, resultAssetId).catch(() => undefined);
    }
    return job;
  } catch (cause) {
    const failure = failureFor(cause);
    const failedAt = now();
    const retrying = failure.code === "MODEL_UNAVAILABLE" && job.attempts < 3;
    if (!retrying) {
      await dependencies.media.deleteTemporary(request.userId, job.personAssetId).catch(() => undefined);
    }
    job = await dependencies.jobs.update(request.userId, request.jobId, {
      status: retrying ? "queued" : failure.code === "SAFETY_BLOCKED" ? "blocked" : "failed",
      updatedAt: failedAt,
      completedAt: retrying ? null : failedAt,
      personDeletedAt: retrying ? null : failedAt,
      failure: retrying
        ? { ...failure, message: "The preview service paused. A private retry is scheduled." }
        : failure,
    });
    return job;
  }
}
