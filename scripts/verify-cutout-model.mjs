import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const EXPECTED_BYTES = 4_574_861;
const EXPECTED_SHA256 = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8";
const modelUrl = new URL("../apps/web/public/models/u2netp.onnx", import.meta.url);

const [metadata, bytes] = await Promise.all([stat(modelUrl), readFile(modelUrl)]);
const sha256 = createHash("sha256").update(bytes).digest("hex");

if (metadata.size !== EXPECTED_BYTES || sha256 !== EXPECTED_SHA256) {
  throw new Error(
    `Cutout model integrity check failed. Expected ${EXPECTED_BYTES} bytes and ${EXPECTED_SHA256}; received ${metadata.size} bytes and ${sha256}.`,
  );
}

console.log(`Verified Yange cutout model: ${metadata.size} bytes, sha256 ${sha256}`);
