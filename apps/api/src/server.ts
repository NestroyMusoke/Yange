import { createServer } from "node:http";
import { resolve } from "node:path";
import {
  createFirestoreStore,
  createGoogleEventPublisher,
  createGoogleMediaStore,
  createGoogleTaskScheduler,
  createStructuredLogger,
  GoogleApplicationDefaultTokenProvider,
  GoogleCalendarAdapter,
  GoogleVertexStructuredGenerationClient,
  GoogleWeatherForecastAdapter,
  InMemoryUserStateStore,
  readRuntimeConfiguration,
  VertexMultimodalAdapter,
  VertexOutfitExplanationAdapter,
} from "@yange/cloud";
import {
  FakeGeminiExplanationAdapter,
  FakeGeminiMultimodalAdapter,
} from "@yange/contracts";
import { createYangeApi } from "./app";

const configuration = readRuntimeConfiguration();
const logger = createStructuredLogger(configuration.projectId);
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const webRoot = process.env.YANGE_WEB_ROOT
  ? resolve(process.env.YANGE_WEB_ROOT)
  : resolve(process.cwd(), "apps", "web", "dist");

const google = configuration.mode === "google"
  && configuration.projectId
  && configuration.taskInvokerServiceAccount
  ? {
    projectId: configuration.projectId,
    workerUrl: configuration.workerUrl,
    mediaBucket: configuration.mediaBucket,
    taskInvokerServiceAccount: configuration.taskInvokerServiceAccount,
  }
  : null;
const store = google
  ? createFirestoreStore(google.projectId, configuration.firestoreDatabase)
  : new InMemoryUserStateStore();
const taskScheduler = google
  ? createGoogleTaskScheduler({
    projectId: google.projectId,
    location: configuration.taskLocation,
    queue: configuration.wearCastQueue,
    workerUrl: google.workerUrl ?? undefined,
    serviceAccountEmail: google.taskInvokerServiceAccount,
  })
  : undefined;
const eventPublisher = google && configuration.role !== "edge"
  ? createGoogleEventPublisher(google.projectId, configuration.eventsTopic)
  : undefined;
const mediaStore = google && configuration.role !== "worker" && google.mediaBucket
  ? createGoogleMediaStore(google.projectId, google.mediaBucket)
  : undefined;
const forecastProviders = new Map<string, GoogleWeatherForecastAdapter>();
const forecastProviderForLocation = google
  ? ({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) => {
      const key = `${latitude.toFixed(4)}:${longitude.toFixed(4)}:${label}`;
      const existing = forecastProviders.get(key);
      if (existing) return existing;
      const created = new GoogleWeatherForecastAdapter({ latitude, longitude, locationLabel: label });
      forecastProviders.set(key, created);
      return created;
    }
  : undefined;
const forecastProvider = forecastProviderForLocation?.({
  latitude: configuration.weatherLatitude,
  longitude: configuration.weatherLongitude,
  label: "Kampala",
});
const calendarProvider = google && configuration.calendarId
  ? new GoogleCalendarAdapter({
      calendarId: configuration.calendarId,
      tokenProvider: new GoogleApplicationDefaultTokenProvider(),
    })
  : undefined;
const vertexClient = google
  ? new GoogleVertexStructuredGenerationClient(google.projectId, configuration.location)
  : null;
const multimodalAnalyzerForUser = vertexClient && mediaStore
  ? (userId: string) => new VertexMultimodalAdapter({
    client: vertexClient,
    mediaStore,
    userId,
    model: configuration.geminiModel,
  })
  : configuration.mode === "local"
    ? () => new FakeGeminiMultimodalAdapter()
    : undefined;
const outfitExplainer = vertexClient
  ? new VertexOutfitExplanationAdapter({
    client: vertexClient,
    model: configuration.geminiModel,
  })
  : configuration.mode === "local"
    ? new FakeGeminiExplanationAdapter()
    : undefined;

const server = createServer(createYangeApi({
  configuration,
  store,
  logger,
  webRoot,
  taskScheduler,
  eventPublisher,
  mediaStore,
  forecastProvider,
  forecastProviderForLocation,
  calendarProvider,
  multimodalAnalyzerForUser,
  outfitExplainer,
}));

server.listen(port, "0.0.0.0", () => {
  logger.write("NOTICE", "service.started", {
    component: "yange-api",
    port,
    mode: configuration.mode,
    role: configuration.role,
  });
});

function shutdown(signal: string): void {
  logger.write("NOTICE", "service.stopping", { component: "yange-api", signal });
  server.close((error) => {
    if (error) {
      logger.write("ERROR", "service.stop_failed", { component: "yange-api", error: error.message });
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
