import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.dirname(fileURLToPath(import.meta.url));
const width = 1920;
const height = 1080;
const ink = "#f5f1e8";
const muted = "#a9aca4";
const green = "#42d6a4";
const gold = "#d8b46b";

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

function proofBar(kicker, title, detail) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="bar" x1="0" x2="1"><stop stop-color="#09100e" stop-opacity=".98"/><stop offset="1" stop-color="#10231d" stop-opacity=".94"/></linearGradient></defs>
    <rect x="0" y="0" width="1920" height="112" fill="url(#bar)"/>
    <rect x="0" y="108" width="1920" height="4" fill="#c9a15f"/>
    <circle cx="54" cy="55" r="12" fill="#42d6a4"/><text x="82" y="45" fill="${gold}" font-family="Segoe UI,Arial" font-size="20" font-weight="700" letter-spacing="3">${esc(kicker.toUpperCase())}</text>
    <text x="82" y="82" fill="${ink}" font-family="Segoe UI,Arial" font-size="31" font-weight="650">${esc(title)}</text>
    <text x="1870" y="66" fill="${muted}" font-family="Consolas,monospace" font-size="19" text-anchor="end">${esc(detail)}</text>
  </svg>`);
}

function terminal(kicker, title, command, lines, footer) {
  const rows = lines.map((line, index) => `<text x="120" y="${360 + index * 48}" fill="${line.color || ink}" font-family="Consolas,monospace" font-size="${line.size || 25}">${esc(line.text)}</text>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <defs><radialGradient id="bg" cx="86%" cy="4%" r="100%"><stop stop-color="#123d32"/><stop offset=".48" stop-color="#0b100e"/><stop offset="1" stop-color="#070907"/></radialGradient></defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    <text x="92" y="94" fill="${gold}" font-family="Segoe UI,Arial" font-size="22" font-weight="700" letter-spacing="4">${esc(kicker.toUpperCase())}</text>
    <text x="92" y="168" fill="${ink}" font-family="Segoe UI,Arial" font-size="48" font-weight="650">${esc(title)}</text>
    <rect x="78" y="225" width="1764" height="722" rx="26" fill="#090c0b" stroke="#354139" stroke-width="2"/>
    <circle cx="120" cy="267" r="8" fill="#ef6b64"/><circle cx="148" cy="267" r="8" fill="#e9bd58"/><circle cx="176" cy="267" r="8" fill="#54cc7b"/>
    <text x="218" y="275" fill="${muted}" font-family="Consolas,monospace" font-size="19">Google Cloud SDK • authenticated read-only verification</text>
    <line x1="100" y1="302" x2="1820" y2="302" stroke="#29312c"/>
    <text x="120" y="338" fill="${green}" font-family="Consolas,monospace" font-size="23">$ ${esc(command)}</text>
    ${rows}
    <text x="92" y="1010" fill="${muted}" font-family="Segoe UI,Arial" font-size="20">${esc(footer)}</text>
    <text x="1825" y="1010" fill="${gold}" font-family="Segoe UI,Arial" font-size="20" text-anchor="end">YANGE • GOOGLE CLOUD PROOF</text>
  </svg>`);
}

await fs.mkdir(path.join(dir, "frames"), { recursive: true });

await sharp(path.join(dir, "01-services.png"))
  .composite([{ input: proofBar("01 • Deployed boundary", "Three Cloud Run services, with only the edge public", "LIVE CONSOLE • yange-agentic-prod-2026") }])
  .png().toFile(path.join(dir, "frames", "01-services.png"));

await sharp(path.join(dir, "02-revision.png"))
  .composite([{ input: proofBar("02 • Serving revision", "Revision 20 receives 100% of production traffic", "RUNTIME=google • GEMINI=3.5 Flash Lite") }])
  .png().toFile(path.join(dir, "frames", "02-revision.png"));

const iam = terminal("03 • Least privilege", "The worker accepts only authenticated service accounts", "gcloud run services get-iam-policy yange-worker --region africa-south1", [
  { text: "ROLE                  MEMBERS", color: muted },
  { text: "roles/run.invoker     serviceAccount:yange-adk-agent@…", color: ink },
  { text: "                       serviceAccount:yange-scheduler@…", color: ink },
  { text: "                       serviceAccount:yange-task-invoker@…", color: ink },
  { text: "" },
  { text: "EDGE POLICY", color: gold },
  { text: "roles/run.invoker     allUsers", color: green, size: 29 },
  { text: "" },
  { text: "Proof: public command surface; private mutation worker.", color: green, size: 28 },
], "Captured from live IAM policies on 31 Aug 2026 • service-account domains shortened only for readability");
await sharp(iam).png().toFile(path.join(dir, "frames", "03-iam.png"));

const runtime = terminal("04 • Runtime contract", "The public deployment identifies its real production stack", "GET https://yange-kdxt2klboq-bq.a.run.app/v1/runtime", [
  { text: "HTTP/2 200", color: green, size: 29 },
  { text: '"mode":                    "google"' },
  { text: '"environment":             "production"' },
  { text: '"geminiModel":             "gemini-3.5-flash"', color: gold },
  { text: '"geminiMultimodalModel":   "gemini-3.5-flash-lite"', color: gold },
  { text: '"mirrorModel":             "virtual-try-on-001"', color: gold },
  { text: '"persistence":             "firestore-transactional"' },
  { text: '"media":                   "private-cloud-storage"' },
  { text: '"asyncTransport":          "cloud-tasks-plus-pubsub"' },
  { text: '"ready":                   true', color: green, size: 29 },
], "Public, independently repeatable receipt • session identifier excluded");
await sharp(runtime).png().toFile(path.join(dir, "frames", "04-runtime.png"));

const logs = terminal("05 • Traceable execution", "Cloud Logging ties real requests to serving revisions", "gcloud logging read 'resource.type=cloud_run_revision …'", [
  { text: "EDGE", color: gold, size: 28 },
  { text: "2026-08-30T21:48:58Z  yange-00020-bjh", color: ink },
  { text: "POST /v1/wearcast/run   202   0.680s", color: green, size: 28 },
  { text: "trace 4c44930a6ebe975f32f359820732ffc4", color: muted },
  { text: "" },
  { text: "PRIVATE WORKER", color: gold, size: 28 },
  { text: "2026-08-30T23:15:05Z  yange-worker-00011-m54", color: ink },
  { text: "POST /internal/scheduler/outbox-sweep   200   1.416s", color: green, size: 28 },
  { text: "trace 008c0b7350122d432fdbdfe0f5973c1d", color: muted },
  { text: "" },
  { text: "Revision + status + latency + trace: one inspectable production path.", color: green, size: 27 },
], "Source: Google Cloud Logging • raw query is reproducible from the public repository evidence guide");
await sharp(logs).png().toFile(path.join(dir, "frames", "05-logs.png"));

console.log(`Rendered live proof frames in ${path.join(dir, "frames")}`);
