import { describe, expect, it } from "vitest";
import {
  checkRuntimeConfiguration,
  publicRuntimeConfiguration,
  readRuntimeConfiguration,
} from "./config";

describe("runtime configuration", () => {
  it("boots locally without credentials and never exposes the session secret", () => {
    const configuration = readRuntimeConfiguration({
      NODE_ENV: "test",
      YANGE_SESSION_SECRET: "local-secret-that-must-not-be-exposed",
    });
    expect(configuration.mode).toBe("local");
    expect(configuration.role).toBe("all");
    expect(configuration.geminiModel).toBe("gemini-3.5-flash");
    expect(configuration.geminiMultimodalModel).toBe("gemini-3.5-flash-lite");
    expect(checkRuntimeConfiguration(configuration)).toEqual({ ready: true, issues: [] });
    expect(publicRuntimeConfiguration(configuration)).not.toHaveProperty("sessionSecret");
  });

  it("routes bounded image extraction independently from richer explanations", () => {
    const configuration = readRuntimeConfiguration({
      GEMINI_MODEL: "gemini-3.5-flash",
      GEMINI_MULTIMODAL_MODEL: "gemini-3.5-flash-lite",
    });
    expect(publicRuntimeConfiguration(configuration)).toMatchObject({
      geminiModel: "gemini-3.5-flash",
      geminiMultimodalModel: "gemini-3.5-flash-lite",
    });
  });

  it("fails readiness with an explicit issue per missing google-mode dependency", () => {
    const configuration = readRuntimeConfiguration({ YANGE_RUNTIME: "google" });
    const check = checkRuntimeConfiguration(configuration);
    expect(check.ready).toBe(false);
    expect(check.issues).toHaveLength(6);
  });

  it("rejects unknown runtime modes", () => {
    expect(() => readRuntimeConfiguration({ YANGE_RUNTIME: "magical" })).toThrow(
      "YANGE_RUNTIME must be either local or google.",
    );
  });

  it("allows a private worker to boot without edge-only media or session secrets", () => {
    const configuration = readRuntimeConfiguration({
      YANGE_RUNTIME: "google",
      YANGE_ROLE: "worker",
      GOOGLE_CLOUD_PROJECT: "test-project",
      YANGE_TASK_INVOKER_SERVICE_ACCOUNT: "tasks@test-project.iam.gserviceaccount.com",
    });
    expect(checkRuntimeConfiguration(configuration)).toEqual({ ready: true, issues: [] });
  });
});
