export type YangeRuntimeMode = "local" | "google";
export type YangeServiceRole = "all" | "edge" | "worker";

export interface RuntimeConfiguration {
  mode: YangeRuntimeMode;
  role: YangeServiceRole;
  environment: "development" | "test" | "production";
  serviceName: string;
  projectId: string | null;
  location: string;
  taskLocation: string;
  geminiModel: string;
  geminiMultimodalModel: string;
  firestoreDatabase: string;
  mediaBucket: string | null;
  wearCastQueue: string;
  eventsTopic: string;
  workerUrl: string | null;
  taskInvokerServiceAccount: string | null;
  allowedOrigin: string | null;
  sessionSecret: string | null;
  weatherBaseUrl: string | null;
  calendarId: string | null;
  mirrorEnabled: boolean;
  mirrorLocation: string;
  mirrorQueue: string;
  mirrorDailyLimit: number;
  weatherLatitude: number;
  weatherLongitude: number;
}

export interface ConfigurationCheck {
  ready: boolean;
  issues: string[];
}

type Environment = Record<string, string | undefined>;

function value(environment: Environment, key: string): string | null {
  const candidate = environment[key]?.trim();
  return candidate ? candidate : null;
}

export function readRuntimeConfiguration(
  environment: Environment = process.env,
): RuntimeConfiguration {
  const requestedMode = value(environment, "YANGE_RUNTIME") ?? "local";
  if (requestedMode !== "local" && requestedMode !== "google") {
    throw new Error("YANGE_RUNTIME must be either local or google.");
  }
  const requestedRole = value(environment, "YANGE_ROLE") ?? "all";
  if (requestedRole !== "all" && requestedRole !== "edge" && requestedRole !== "worker") {
    throw new Error("YANGE_ROLE must be all, edge, or worker.");
  }
  const requestedEnvironment = value(environment, "NODE_ENV") ?? "development";
  const appEnvironment = requestedEnvironment === "production"
    ? "production"
    : requestedEnvironment === "test"
      ? "test"
      : "development";

  return {
    mode: requestedMode,
    role: requestedRole,
    environment: appEnvironment,
    serviceName: value(environment, "K_SERVICE") ?? "yange-api-local",
    projectId: value(environment, "GOOGLE_CLOUD_PROJECT"),
    location: value(environment, "GOOGLE_CLOUD_LOCATION") ?? "global",
    taskLocation: value(environment, "YANGE_TASK_LOCATION") ?? "me-central1",
    geminiModel: value(environment, "GEMINI_MODEL") ?? "gemini-3.5-flash",
    geminiMultimodalModel: value(environment, "GEMINI_MULTIMODAL_MODEL") ?? "gemini-3.5-flash-lite",
    firestoreDatabase: value(environment, "FIRESTORE_DATABASE") ?? "(default)",
    mediaBucket: value(environment, "YANGE_MEDIA_BUCKET"),
    wearCastQueue: value(environment, "YANGE_WEARCAST_QUEUE") ?? "wearcast-runs",
    eventsTopic: value(environment, "YANGE_EVENTS_TOPIC") ?? "domain-events",
    workerUrl: value(environment, "YANGE_WORKER_URL"),
    taskInvokerServiceAccount: value(environment, "YANGE_TASK_INVOKER_SERVICE_ACCOUNT"),
    allowedOrigin: value(environment, "YANGE_ALLOWED_ORIGIN"),
    sessionSecret: value(environment, "YANGE_SESSION_SECRET"),
    weatherBaseUrl: value(environment, "WEATHER_PROVIDER_BASE_URL"),
    calendarId: value(environment, "GOOGLE_CALENDAR_ID"),
    mirrorEnabled: value(environment, "YANGE_MIRROR_ENABLED") === "true",
    mirrorLocation: value(environment, "YANGE_MIRROR_LOCATION") ?? "europe-west1",
    mirrorQueue: value(environment, "YANGE_MIRROR_QUEUE") ?? "mirror-previews",
    mirrorDailyLimit: Number.parseInt(value(environment, "YANGE_MIRROR_DAILY_LIMIT") ?? "4", 10),
    weatherLatitude: Number.parseFloat(value(environment, "YANGE_WEATHER_LATITUDE") ?? "0.3476"),
    weatherLongitude: Number.parseFloat(value(environment, "YANGE_WEATHER_LONGITUDE") ?? "32.5825"),
  };
}

export function checkRuntimeConfiguration(
  configuration: RuntimeConfiguration,
): ConfigurationCheck {
  if (configuration.mode === "local") return { ready: true, issues: [] };
  const issues: string[] = [];
  if (!configuration.projectId) issues.push("GOOGLE_CLOUD_PROJECT is required in google mode.");
  if (configuration.role !== "worker" && !configuration.mediaBucket) {
    issues.push("YANGE_MEDIA_BUCKET is required in google edge mode.");
  }
  if (configuration.role !== "worker" && !configuration.workerUrl) {
    issues.push("YANGE_WORKER_URL is required in google edge mode.");
  }
  if (!configuration.taskInvokerServiceAccount) {
    issues.push("YANGE_TASK_INVOKER_SERVICE_ACCOUNT is required in google mode.");
  }
  if (configuration.role !== "worker" && !configuration.allowedOrigin) {
    issues.push("YANGE_ALLOWED_ORIGIN is required in google edge mode.");
  }
  if (configuration.role !== "worker" && (!configuration.sessionSecret || configuration.sessionSecret.length < 32)) {
    issues.push("YANGE_SESSION_SECRET must contain at least 32 characters in google edge mode.");
  }
  if (configuration.mirrorEnabled && !configuration.mediaBucket) {
    issues.push("YANGE_MEDIA_BUCKET is required when Yange Mirror is enabled.");
  }
  if (configuration.mirrorEnabled && (!Number.isInteger(configuration.mirrorDailyLimit) || configuration.mirrorDailyLimit < 1 || configuration.mirrorDailyLimit > 20)) {
    issues.push("YANGE_MIRROR_DAILY_LIMIT must be between 1 and 20.");
  }
  return { ready: issues.length === 0, issues };
}

export function publicRuntimeConfiguration(configuration: RuntimeConfiguration) {
  return {
    mode: configuration.mode,
    role: configuration.role,
    environment: configuration.environment,
    serviceName: configuration.serviceName,
    projectId: configuration.projectId,
    location: configuration.location,
    taskLocation: configuration.taskLocation,
    geminiModel: configuration.geminiModel,
    geminiMultimodalModel: configuration.geminiMultimodalModel,
    firestoreDatabase: configuration.firestoreDatabase,
    mediaBucketConfigured: Boolean(configuration.mediaBucket),
    workerConfigured: Boolean(configuration.workerUrl),
    taskInvokerConfigured: Boolean(configuration.taskInvokerServiceAccount),
    weatherConfigured: configuration.mode === "google",
    calendarConfigured: Boolean(configuration.calendarId),
    mirrorConfigured: configuration.mirrorEnabled,
    mirrorModel: configuration.mirrorEnabled ? "virtual-try-on-001" : null,
    mirrorProcessingRegion: configuration.mirrorEnabled ? configuration.mirrorLocation : null,
    mirrorDailyLimit: configuration.mirrorEnabled ? configuration.mirrorDailyLimit : 0,
  };
}
