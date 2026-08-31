# Yange

## Submission identity

**Tagline**  
The wardrobe agent that remembers what is clean, learns what feels like you, and acts before weather or laundry disrupts your plans.

**Category**  
Taskmaster

**One-line hook**  
Some mornings I lost 30 minutes to my own closet. Yange ended that.

**Live product**  
https://yange-kdxt2klboq-bq.a.run.app/

**Source code**  
https://github.com/NestroyMusoke/Yange

**Build story**  
https://medium.com/@franciamusoke/i-lost-30-minutes-a-day-to-my-closet-so-i-built-an-agent-that-remembers-what-i-cant-39b9bc11e89a

## Project description

### Inspiration

Some mornings I lost 30 minutes to my own closet.

I am Musoke Nestroy, a fashion lover building from Kampala, Uganda. The problem was not that I lacked clothes. I was trying to remember too many changing facts at once: what was still clean, what I had overused, what needed washing, what the weather might do, where I was going and whether an outfit would actually feel like me.

Laundry repeated the same problem. I reread care labels, tried to decode their symbols and guessed whether clothes would dry before I needed them. A [2017 survey of 500 people in the UK](https://www.laundryandcleaningnews.com/news/over-half-of-people-find-clothing-care-labels-confusing-5768936/) found that 56% did not always understand clothing-care symbols. A [2023 study of 159 Family and Consumer Sciences students in Ghana](https://www.scipublications.com/journal/index.php/jad/article/view/703) found that 42.1% did not understand care-label information.

I realised this was not merely an outfit recommendation problem. It was a memory, state and forward-planning problem.

That became **Yange**. In Luganda, *yange* means **mine**. The name is the promise: my wardrobe, my evidence, my preferences and an agent that learns my routines instead of telling me what should look good on my body.

### What it does

One Friday explains the entire product:

1. I photograph a garment and its care label. Gemini extracts observable evidence into a typed contract. Uncertain facts wait for my confirmation.
2. I type what I need or upload a Pinterest image or saved social-video frame. Yange extracts the look's palette, silhouette, layering and occasion cues.
3. Yange searches only garments that are actually available. It rejects infeasible combinations, scores the rest against weather, occasion, care practicality, comfort and learned preferences, then explains the winning choice.
4. After I wear it, a Confidence Check-in records how I felt. Colour-specific feedback is stronger than a broad outfit rating, so Yange does not pretend to know which detail caused confidence.
5. The outfit's pieces move independently into rewearable, airing, laundry or available states according to their material and care evidence.
6. If a future plan now depends on something dirty, Yange detects the risk without another prompt. It checks the seven-day forecast, finds the safest washing opportunity, separates compatible laundry, sends a timely warning and preserves a verified fallback outfit when recovery is uncertain.

This is a complete workflow, not a fashion chatbot. The agent watches changing wardrobe state, simulates what happens next and completes the safe parts asynchronously.

### What makes Yange different

**The wardrobe is a live system, not a photo album.**  
An append-only event ledger reconstructs the current state of every piece. Wearing an outfit does not mark everything dirty. A T-shirt may enter laundry, jeans may remain rewearable, a jacket may need airing and shoes may remain available.

[![A real garment photo becoming a clean wardrobe asset](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/157/datas/original.png)](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/157/datas/original.png)

*A real bedroom photo becomes a clean wardrobe asset while the independent Gemini evidence path remains fast and trustworthy.*

**Recommendations cannot invent clothes.**  
Hard availability constraints run before ranking. Gemini explains the result, but it cannot select an unavailable garment, change the score or mutate wardrobe state.

[![A saved inspiration image becoming structured Look DNA](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/156/datas/original.png)](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/156/datas/original.png)

*A saved inspiration image becomes reviewable palette, proportion, styling and occasion evidence, never imaginary inventory.*

**Laundry is operational intelligence.**  
Confirmed care evidence becomes an incompatibility graph. Unsafe pairings are blocked, unknown-care pieces are held for review and each compatible load receives its own wash and drying route. Weather is used as decision context, not decoration.

[![Care evidence becoming four explained, safe wash groups](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/155/datas/original.png)](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/155/datas/original.png)

*Confirmed care evidence blocks unsafe pairings, holds one uncertain garment and produces four explained, care-safe wash groups.*

**Personalisation comes from lived feedback.**  
Height, fit, comfort and colour preferences are user-controlled inputs, not attractiveness judgements. Exact positive and negative colour evidence, recency and repeated confident wears shape future recommendations.

**The interface visibly earns familiarity.**  
The WebGL Style Aura gradually changes toward the user's learned colour palette. One interaction can move the displayed palette by at most 8%. The receipt behind it explains the evidence. If WebGL fails, the Aura becomes a still image while every wardrobe action continues working.

[![The live Yange wardrobe loop and learning Style Aura](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/160/datas/original.gif)](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/160/datas/original.gif)

*Wearing one outfit updates garment states, records confidence and begins shaping the personal Style Aura.*

### How I built it

Yange follows one engineering rule:

> **AI proposes. Validated domain rules commit.**

The browser prepares images, strips metadata and stores the private original. Two independent paths then begin. Gemini 3.5 Flash Lite extracts structured garment, care-label or inspiration evidence. In parallel, a dedicated Web Worker runs a lightweight U²-Net segmentation model through ONNX Runtime Web and WebAssembly to create a clean garment cutout. Background removal cannot delay, replace or corrupt the evidence path.

For asynchronous planning, the browser sends a typed command to a public Cloud Run edge. Cloud Tasks dispatches an OIDC-authenticated job to a private worker. The worker rebuilds the wardrobe projection from Firestore, obtains Google Weather context, simulates doing nothing versus acting now and commits the validated event, projection and transactional outbox atomically. Pub/Sub and notification delivery continue from durable checkpoints.

The private Google ADK steward uses Gemini 3.5 Flash and exposes only two narrow tools: inspect the current wardrobe and request a verified WearCast run. It cannot write Firestore directly or bypass domain validation.

[![Yange's production architecture on Google Cloud](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/159/datas/original.png)](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/159/datas/original.png)

*Three role-separated Cloud Run services connect Vertex AI to deterministic policy, transactional state and durable transport.*

### Verified on Google Cloud

This is the deployed production boundary, not a proposed architecture. The live Google Cloud project runs three role-separated Cloud Run services in `africa-south1`: the public `yange` edge, an authenticated private `yange-worker`, and an authenticated private `yange-steward`. The separation keeps user traffic, deterministic execution and supervised ADK reasoning under different access boundaries.

[![Actual Google Cloud Run console showing Yange's three deployed services and their authentication boundaries](https://raw.githubusercontent.com/NestroyMusoke/Yange/refs/heads/main/docs/submission-assets/google-cloud-run-services.png)](https://raw.githubusercontent.com/NestroyMusoke/Yange/refs/heads/main/docs/submission-assets/google-cloud-run-services.png)

*Unedited Google Cloud Console screenshot: Cloud Run lists the public edge and two authentication-required services together in `africa-south1`.*

Cloud Logging provides a second, independent proof surface. The live Logs Explorer shows successful production traffic from the private worker together with Cloud Scheduler activity and application completion events inside the `yange-agentic-prod-2026` project.

[![Actual Google Cloud Logs Explorer showing Yange production worker and scheduler activity](https://raw.githubusercontent.com/NestroyMusoke/Yange/refs/heads/main/docs/submission-assets/google-cloud-logs-explorer.png)](https://raw.githubusercontent.com/NestroyMusoke/Yange/refs/heads/main/docs/submission-assets/google-cloud-logs-explorer.png)

*Unedited Google Cloud Console screenshot: Logs Explorer shows nine recent results, including a successful `POST 200` request to the Yange worker and Cloud Scheduler execution records.*

The project is also connected to Google Cloud's operational surfaces for the services Yange depends on. The Monitoring console exposes dashboards for Cloud Storage, Cloud Tasks, Logs, Pub/Sub and Vertex AI so the same production system can be inspected beyond the application interface.

[![Actual Google Cloud Monitoring console showing operational dashboards relevant to Yange](https://raw.githubusercontent.com/NestroyMusoke/Yange/refs/heads/main/docs/submission-assets/google-cloud-monitoring.png)](https://raw.githubusercontent.com/NestroyMusoke/Yange/refs/heads/main/docs/submission-assets/google-cloud-monitoring.png)

*Unedited Google Cloud Console screenshot: the production project's Monitoring catalogue includes Cloud Storage, Cloud Tasks, Logs, Pub/Sub and Vertex AI operational dashboards.*

For the deep technical dive—including the event model, trust boundaries, failure containment, replay safety, Style Aura learning method, WearCast orchestration and care-safe Laundry algorithm—see the [public GitHub README](https://github.com/NestroyMusoke/Yange). It contains the complete architecture, methodology, evidence guide and reproducible setup behind Yange.

### Architecture that survives failure

WearCast has six durable checkpoints: triggered, forecast acquired, decision simulated, interventions committed, notifications delivered and completed.

- Duplicate Cloud Tasks or scheduler triggers return the existing receipt instead of repeating domain effects.
- If notification delivery fails after a valid intervention commits, retry resumes from the notification checkpoint. The wardrobe action is preserved and the message is not duplicated.
- Invalid or stale weather context cannot manufacture certainty. The action is held or a stored validated snapshot is labelled with its age.
- Malformed Gemini output fails schema validation and never becomes a trusted wardrobe fact.
- Firestore writes the event, projection, checkpoint and outbox inside one transaction.
- Public edge, private worker and private ADK service use separate Cloud Run roles and least-privilege identities.

[![WearCast's durable checkpoints and failure recovery paths](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/158/datas/original.png)](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/212/158/datas/original.png)

*WearCast plans with forecast context, six durable checkpoints, idempotent retries and a verified fallback outfit.*

### Google technology used

- **Gemini 3.5 Flash Lite on Vertex AI:** frequent schema-constrained extraction from garment, care-label and inspiration images
- **Gemini 3.5 Flash on Vertex AI:** explanation and supervised ADK reasoning
- **Google GenAI SDK:** Vertex AI model adapters
- **Google Agent Development Kit:** private Yange steward with two narrow tools
- **Google Virtual Try-On `virtual-try-on-001`:** optional, asynchronous single-garment preview labelled as an AI visualization, not a fit guarantee
- **Cloud Run:** public application edge, private deterministic worker and private ADK service
- **Firestore:** append-only event ledger, rebuildable projections, workflow checkpoints and transactional outbox
- **Cloud Storage:** private media with short-lived signed access
- **Cloud Tasks and Cloud Scheduler:** OIDC-authenticated background execution and scheduled planning
- **Pub/Sub:** ordered audit events, retry transport and dead-letter handling
- **Google Weather API:** timestamped forecast and drying-suitability context
- **Terraform:** reproducible infrastructure and service identities

The two Gemini variants are intentional. Flash Lite handles frequent, schema-constrained visual extraction. Flash handles higher-level explanation and supervised agent reasoning. Deterministic TypeScript policies remain the sole authority for availability, scoring, care safety, state transitions and commits.

### Challenges

The hard part was not generating an outfit description. It was containing uncertainty and failure.

I separated the visual cutout from the critical evidence path after learning that presentation work should never block wardrobe capture. I designed replay-safe checkpoints because Cloud Tasks may deliver more than once. I added a safe migration path when older Firestore projections lacked newer profile fields. A Virtual Try-On experiment preserved identity and pose but smoothed fabric and removed a small wrist accessory, so I narrowed the feature and made its limitations explicit instead of turning an experiment into a fit claim.

### Accomplishments

- A responsive product tested with real garments and care labels on a phone
- A complete event-driven workflow from wear to laundry risk, safe intervention and fallback
- Explainable confidence and colour memory rather than opaque personalisation
- Browser-side background removal that stays independent from Gemini latency
- Three role-separated Cloud Run services with a private worker and private ADK agent
- 108 automated TypeScript tests passing
- Strict typechecking passing across every workspace
- Production build passing across every buildable workspace
- A public deployment with health, readiness and runtime receipts
- Public source, reproducible setup, Terraform and dated cloud evidence

### What I learned

An agent becomes trustworthy when its authority is smaller than its intelligence. Models are excellent at interpreting ambiguity and explaining decisions. They should not silently own availability, laundry safety or durable state.

I also learned that personalisation feels meaningful when the user can see it being earned. Style Aura began as the visual cherry on top. It became a compact promise that Yange is learning from evidence, gradually and inspectably, without claiming to know the user after one click.

### What's next

The next production step is user-authorised Google Calendar OAuth for read-only occasion context. After that, I want to add intentional shopping gap analysis that first proves a purchase creates useful combinations with clothes already owned. Direct social-video ingestion and local price discovery remain later work. The current product stays focused on using existing clothes better and keeping them wearable longer.

## Solo contribution

I conceived, designed, engineered, tested and deployed Yange independently from idea to production. I defined the product and user experience, built the React and TypeScript interface and WebGL Style Aura, implemented Gemini multimodal extraction, event-sourced wardrobe memory, confidence and colour learning, care-label laundry grouping, WearCast planning, browser-side background removal and the constrained Virtual Try-On experiment. I designed the Google Cloud architecture across Cloud Run, Firestore, Cloud Tasks, Cloud Scheduler, Pub/Sub, Cloud Storage, Vertex AI and Google ADK; wrote the automated tests, Terraform, documentation and reproducible setup; tested Yange with real garments and care labels; and created the architecture diagrams, demo materials, README, Medium story and Devpost submission. Yange is a solo project, built end to end by me, Musoke Nestroy.

## Required Devpost field answers

| Field | Answer |
| --- | --- |
| Submitter Type | Individuals |
| Submitter country of residence | Uganda |
| Category | Taskmaster |
| Organization name | Not applicable, individual submission |
| Project start date | 08-14-26 |
| Code repository | https://github.com/NestroyMusoke/Yange |
| Reproducible README instructions | Yes |
| Hosted project | https://yange-kdxt2klboq-bq.a.run.app/ |
| Google SDKs | Agent Development Kit (ADK), Google GenAI SDK (google-genai) |
| Google Cloud services | Cloud Run, Firestore, Pub/Sub |
| Google AI models | Gemini 3.5 Flash Lite, Gemini 3.5 Flash, Google Virtual Try-On virtual-try-on-001 |
| Bonus content | https://medium.com/@franciamusoke/i-lost-30-minutes-a-day-to-my-closet-so-i-built-an-agent-that-remembers-what-i-cant-39b9bc11e89a |

### Private testing instructions for judges

No credentials required. In **Wardrobe**, upload a garment and care label, review evidence and confirm. In **Outfits**, upload inspiration, save Look DNA, generate a look, mark it worn and check in. Open **Laundry** for care-safe groups and **More > Cloud proof**.

## Submission media order

Use only the strongest six items in the public gallery. The detailed diagrams can also remain in the repository for technical judges.

1. `docs/submission-assets/00-yange-live-product.gif`  
   **Caption:** A live wardrobe loop. Wearing one outfit updates garment states, records confidence and begins moving the personal Style Aura.
2. `docs/submission-assets/01-capture-to-clean-wardrobe.png`  
   **Caption:** A real bedroom photo becomes a clean wardrobe asset without coupling presentation latency to Gemini evidence extraction.
3. `docs/submission-assets/02-inspiration-to-look-dna.png`  
   **Caption:** A saved inspiration frame becomes reviewable palette, proportion, styling and occasion evidence, never imaginary inventory.
4. `docs/submission-assets/03-care-safe-laundry.png`  
   **Caption:** Confirmed care evidence blocks nine unsafe pairings, holds one uncertain garment and produces four explained wash groups.
5. `docs/submission-assets/05-wearcast-reliability.png`  
   **Caption:** WearCast removes future wardrobe friction through forecast-aware planning, six durable checkpoints and replay-safe intervention.
6. `docs/submission-assets/06-production-architecture.png`  
   **Caption:** The deployed boundary: three Cloud Run roles, Vertex AI, deterministic decision authority, transactional state and asynchronous transport.

### Required architecture upload

Upload `docs/submission-assets/06-production-architecture.png` to the dedicated Architecture diagram field.

### Keep available as technical backup

- `docs/submission-assets/04-vision-pipeline.png`
- `artifacts/cloud-proof/Yange-Live-Google-Cloud-Proof.mp4`
- `artifacts/cloud-proof/live-console/01-services.png`
- `artifacts/cloud-proof/live-console/02-revision.png`
- `artifacts/cloud-proof/live-console/04-runtime.png`
- `artifacts/cloud-proof/live-console/05-logs.png`

## Final manual items

- [ ] Add the final public YouTube or Vimeo demo URL
- [x] Upload the architecture diagram
- [x] Upload the six gallery assets in the order above
- [ ] Confirm the Medium article contains the required hackathon-purpose disclosure
- [ ] Add an optional social post URL only if it contains the required hashtag
- [ ] Preview every link in a signed-out browser
- [ ] Watch the final video once with sound and once muted
- [ ] Submit before 5:00 PM Pacific Time on August 31, 2026
