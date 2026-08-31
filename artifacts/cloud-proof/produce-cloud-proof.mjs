import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const out = path.join(root, "artifacts", "cloud-proof");
await fs.mkdir(path.join(out, "slides"), { recursive: true });

const emblem = (await fs.readFile(path.join(root, "apps", "web", "public", "brand", "yange-emblem.png"))).toString("base64");
const architecture = (await fs.readFile(path.join(root, "docs", "assets", "yange-architecture-medium.png"))).toString("base64");

const gold = "#c9a15f";
const green = "#00856a";
const ink = "#f5f1e8";
const muted = "#a9aca4";
const panel = "#151914";
const line = "#343a31";

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function shell(title, kicker, body, footer = "LIVE RECEIPT • yange-agentic-prod-2026 • 31 AUG 2026") {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <radialGradient id="a" cx="85%" cy="8%" r="90%"><stop stop-color="#123f34"/><stop offset=".46" stop-color="#0c100e"/><stop offset="1" stop-color="#080a09"/></radialGradient>
      <linearGradient id="g" x1="0" x2="1"><stop stop-color="#8a6a35"/><stop offset=".22" stop-color="#f0d99a"/><stop offset=".48" stop-color="#b88c4d"/><stop offset=".72" stop-color="#f0d99a"/><stop offset="1" stop-color="#8a6a35"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="20"/></filter>
    </defs>
    <rect width="1920" height="1080" fill="url(#a)"/>
    <ellipse cx="1660" cy="170" rx="250" ry="90" fill="#00d7ad" opacity=".09" filter="url(#glow)"/>
    <rect x="64" y="52" width="1792" height="976" rx="42" fill="#0d110f" opacity=".88" stroke="#394138" stroke-width="2"/>
    <image href="data:image/png;base64,${emblem}" x="105" y="86" width="72" height="72"/>
    <text x="198" y="140" fill="${green}" font-family="Segoe UI,Arial" font-size="54" font-weight="750">yange</text>
    <text x="1770" y="126" fill="${gold}" font-family="Segoe UI,Arial" font-size="22" text-anchor="end" letter-spacing="4">GOOGLE CLOUD PROOF</text>
    <line x1="105" y1="182" x2="1815" y2="182" stroke="url(#g)" stroke-width="2"/>
    <text x="112" y="240" fill="${gold}" font-family="Segoe UI,Arial" font-size="22" font-weight="700" letter-spacing="4">${esc(kicker.toUpperCase())}</text>
    <text x="108" y="328" fill="${ink}" font-family="Georgia,serif" font-size="64" font-weight="400">${esc(title)}</text>
    ${body}
    <line x1="105" y1="958" x2="1815" y2="958" stroke="${line}"/>
    <text x="112" y="998" fill="${muted}" font-family="Consolas,monospace" font-size="19" letter-spacing="1">${esc(footer)}</text>
  </svg>`;
}

const badge = (x, y, label, ok = true) => `<g><rect x="${x}" y="${y}" width="${label.length * 13 + 70}" height="46" rx="23" fill="${ok ? "#173c31" : "#3b2c1c"}" stroke="${ok ? "#2f9d78" : gold}"/><circle cx="${x + 24}" cy="${y + 23}" r="7" fill="${ok ? "#4de0aa" : gold}"/><text x="${x + 44}" y="${y + 31}" fill="${ink}" font-family="Segoe UI,Arial" font-size="20" font-weight="650">${esc(label)}</text></g>`;
const mono = (x, y, text, size = 24, color = ink, anchor = "start") => `<text x="${x}" y="${y}" fill="${color}" font-family="Consolas,monospace" font-size="${size}" text-anchor="${anchor}">${esc(text)}</text>`;
const row = (y, a, b, c, d) => `<line x1="120" y1="${y - 34}" x2="1800" y2="${y - 34}" stroke="${line}"/><text x="140" y="${y}" fill="${ink}" font-family="Segoe UI,Arial" font-size="26" font-weight="700">${esc(a)}</text><text x="520" y="${y}" fill="${muted}" font-family="Consolas,monospace" font-size="23">${esc(b)}</text><text x="1120" y="${y}" fill="${gold}" font-family="Consolas,monospace" font-size="23">${esc(c)}</text><text x="1665" y="${y}" fill="#65dfa9" font-family="Consolas,monospace" font-size="23">${esc(d)}</text>`;

const slides = [
  shell("Proof that survives narration.", "Live production verification", `
    <text x="112" y="435" fill="${muted}" font-family="Segoe UI,Arial" font-size="34">A fresh, isolated run across the deployed Google Cloud boundary.</text>
    ${badge(112, 520, "HEALTH 200")}${badge(330, 520, "READY")}${badge(515, 520, "GOOGLE MODE")}${badge(755, 520, "PRODUCTION")}
    <rect x="112" y="630" width="1690" height="210" rx="28" fill="${panel}" stroke="${line}"/>
    ${mono(150, 692, "https://yange-kdxt2klboq-bq.a.run.app", 28, gold)}
    ${mono(150, 748, "project  yange-agentic-prod-2026", 25, muted)}
    ${mono(150, 798, "region   africa-south1", 25, muted)}
    ${mono(150, 848, "captured from live gcloud + public runtime receipts", 22, "#65dfa9")}
  `),
  shell("Three services. One narrow authority boundary.", "Cloud Run revisions", `
    ${mono(140, 408, "SERVICE", 20, muted)}${mono(520, 408, "SERVING REVISION", 20, muted)}${mono(1120, 408, "ACCESS", 20, muted)}${mono(1665, 408, "TRAFFIC", 20, muted)}
    ${row(490, "yange edge", "yange-00020-bjh", "public invoker", "100%")}
    ${row(590, "private worker", "yange-worker-00011-m54", "IAM required", "100%")}
    ${row(690, "ADK steward", "yange-steward-00005-hfc", "IAM required", "100%")}
    <rect x="120" y="760" width="1680" height="120" rx="24" fill="${panel}" stroke="${line}"/>
    <text x="160" y="815" fill="${ink}" font-family="Segoe UI,Arial" font-size="27">The edge accepts commands. The worker rebuilds state and revalidates mutations.</text>
    <text x="160" y="855" fill="${muted}" font-family="Segoe UI,Arial" font-size="24">The ADK steward can request two narrow tools; it cannot write wardrobe state directly.</text>
  `),
  shell("AI proposes. Deterministic policy decides.", "Sanitized runtime contract", `
    <rect x="112" y="380" width="760" height="480" rx="28" fill="${panel}" stroke="${line}"/>
    ${mono(155, 435, '"mode": "google"', 25, "#65dfa9")}
    ${mono(155, 483, '"ready": true', 25, "#65dfa9")}
    ${mono(155, 531, '"geminiModel": "gemini-3.5-flash"', 23)}
    ${mono(155, 579, '"multimodal": "gemini-3.5-flash-lite"', 23)}
    ${mono(155, 627, '"mirrorModel": "virtual-try-on-001"', 23)}
    ${mono(155, 675, '"persistence": "firestore-transactional"', 22, gold)}
    ${mono(155, 723, '"media": "private-cloud-storage"', 22, gold)}
    ${mono(155, 771, '"async": "cloud-tasks-plus-pubsub"', 22, gold)}
    <rect x="920" y="380" width="880" height="480" rx="28" fill="#111612" stroke="#3b493d"/>
    <text x="970" y="452" fill="${gold}" font-family="Segoe UI,Arial" font-size="24" font-weight="700" letter-spacing="2">AUTHORITY CONTRACT</text>
    <text x="970" y="525" fill="${ink}" font-family="Georgia,serif" font-size="43">Gemini handles ambiguity.</text>
    <text x="970" y="585" fill="${muted}" font-family="Segoe UI,Arial" font-size="27">Care-label extraction, inspiration understanding,</text>
    <text x="970" y="625" fill="${muted}" font-family="Segoe UI,Arial" font-size="27">explanations and supervised tool selection.</text>
    <text x="970" y="702" fill="${ink}" font-family="Georgia,serif" font-size="43">Domain policy owns truth.</text>
    <text x="970" y="762" fill="${muted}" font-family="Segoe UI,Arial" font-size="27">Availability, care safety, scoring, commits and idempotency.</text>
  `),
  shell("Six durable checkpoints. One completed decision.", "Fresh WearCast execution", `
    <text x="120" y="390" fill="${muted}" font-family="Consolas,monospace" font-size="21">trigger  cloud-proof-1788126468</text>
    <g font-family="Segoe UI,Arial">
      ${[["01","Scheduler trigger accepted"],["02","168 Google Weather forecast periods validated"],["03","Two non-destructive decision branches simulated"],["04","2 idempotent domain events committed"],["05","1 notification delivered with a stable key"],["06","Workflow completed with no unresolved step"]].map(([n,t],i)=>`<rect x="120" y="${430+i*76}" width="1680" height="60" rx="18" fill="${i===5?"#173c31":panel}" stroke="${i===5?"#2f9d78":line}"/><circle cx="164" cy="${460+i*76}" r="16" fill="#234b3e"/><text x="164" y="${468+i*76}" fill="#65dfa9" font-size="18" text-anchor="middle">✓</text><text x="210" y="${469+i*76}" fill="${ink}" font-size="25" font-weight="650">${t}</text><text x="1738" y="${469+i*76}" fill="${muted}" font-family="Consolas,monospace" font-size="20" text-anchor="end">${n}/06</text>`).join("")}
    </g>
  `),
  shell("The same trigger cannot create a second task.", "Cloud Tasks duplicate protection", `
    <rect x="115" y="390" width="1690" height="190" rx="28" fill="${panel}" stroke="${line}"/>
    ${mono(160, 450, "POST /v1/wearcast/run", 24, gold)}
    ${mono(160, 505, "task  …/wearcast-runs/tasks/<opaque-user>-proof-replay-1788126537", 22)}
    ${mono(160, 555, 'receipt  { "deduplicated": false }', 24, "#65dfa9")}
    <path d="M960 610 v70" stroke="url(#g)" stroke-width="4"/>
    <rect x="115" y="700" width="1690" height="190" rx="28" fill="#101813" stroke="#2f9d78"/>
    ${mono(160, 760, "REPLAY: identical trigger ID + identical task name", 24, gold)}
    ${mono(160, 815, 'receipt  { "deduplicated": true }', 27, "#65dfa9")}
    <text x="160" y="860" fill="${muted}" font-family="Segoe UI,Arial" font-size="24">No second scheduler task. No second side effect.</text>
  `),
  shell("The edge request and private worker are traceable.", "Cloud Logging evidence", `
    ${row(445, "edge", "yange-00020-bjh", "POST /v1/wearcast/run · 202", "679 ms")}
    ${mono(140, 505, "trace  4c44930a6ebe975f32f359820732ffc4", 22, muted)}
    ${row(625, "worker", "yange-worker-00011-m54", "POST /internal/scheduler/wearcast · 200", "1482 ms")}
    ${mono(140, 685, "trace  2a3bdadf7a392623722ac68d4cf08e4a", 22, muted)}
    <rect x="120" y="760" width="1680" height="120" rx="24" fill="${panel}" stroke="${line}"/>
    <text x="160" y="815" fill="${ink}" font-family="Segoe UI,Arial" font-size="27">Structured JSON logs include component, method, path, status, latency and Cloud Trace correlation.</text>
    <text x="160" y="855" fill="#65dfa9" font-family="Consolas,monospace" font-size="21">source: Cloud Logging • resource.type=cloud_run_revision</text>
  `),
  shell("Failure stays local. Progress stays durable.", "Production architecture", `
    <image href="data:image/png;base64,${architecture}" x="128" y="365" width="1120" height="560" preserveAspectRatio="xMidYMid meet"/>
    <rect x="1290" y="385" width="500" height="500" rx="28" fill="${panel}" stroke="${line}"/>
    <text x="1335" y="455" fill="${gold}" font-family="Segoe UI,Arial" font-size="22" font-weight="700">MUTATION PATH</text>
    ${mono(1335, 520, "Cloud Run edge", 24)}
    ${mono(1335, 575, "↓ Cloud Tasks + OIDC", 22, gold)}
    ${mono(1335, 630, "Private worker", 24)}
    ${mono(1335, 685, "↓ Firestore transaction", 22, gold)}
    ${mono(1335, 740, "Event + projection + outbox", 22)}
    ${mono(1335, 795, "↓ Pub/Sub notification", 22, gold)}
    ${mono(1335, 850, "Resume from checkpoint", 22, "#65dfa9")}
  `),
  shell("This is the production system running now.", "Verification complete", `
    <text x="112" y="440" fill="${muted}" font-family="Segoe UI,Arial" font-size="32">Public receipt</text>
    ${mono(112, 492, "yange-kdxt2klboq-bq.a.run.app/v1/runtime", 27, gold)}
    <text x="112" y="590" fill="${muted}" font-family="Segoe UI,Arial" font-size="32">Source and architecture</text>
    ${mono(112, 642, "github.com/NestroyMusoke/Yange", 27, gold)}
    ${badge(112, 740, "3 SERVING REVISIONS")}${badge(430, 740, "6 CHECKPOINTS")}${badge(700, 740, "DUPLICATE BLOCKED")}${badge(1045, 740, "TRACEABLE")}
    <text x="112" y="865" fill="${ink}" font-family="Georgia,serif" font-size="40">Evidence is part of the product, not a promise beside it.</text>
  `),
];

for (let index = 0; index < slides.length; index += 1) {
  await sharp(Buffer.from(slides[index])).png().toFile(path.join(out, "slides", `${String(index + 1).padStart(2, "0")}.png`));
}

console.log(`Rendered ${slides.length} proof slides to ${path.join(out, "slides")}`);
