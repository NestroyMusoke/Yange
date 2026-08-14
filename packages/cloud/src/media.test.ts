import type { Storage } from "@google-cloud/storage";
import { describe, expect, it } from "vitest";
import { GoogleCloudStorageMediaStore } from "./media";

describe("private media validation", () => {
  it("rejects content whose declared image type does not match its bytes", async () => {
    const file = {
      async getMetadata() { return [{ size: "20", contentType: "image/png" }]; },
      async download() { return [Buffer.from("this is not a PNG file")]; },
    };
    const storage = {
      bucket() { return { file() { return file; } }; },
    } as unknown as Storage;
    const store = new GoogleCloudStorageMediaStore(storage, "private-test-bucket");

    await expect(store.readBytes("user-a", "asset-a")).rejects.toThrow(
      "binary signature validation",
    );
  });
});
