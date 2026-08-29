# Yange Mirror safety and experiment record

## Product boundary

Yange Mirror is an optional single-garment visualization after an outfit has already been selected and reserved. It answers one narrow question: “What might this photographed top look like on me?” It does not generate the outfit, change Personal Match, learn body preferences, update Style Aura, or commit anything to the Wardrobe Digital Twin.

The interface uses **Preview on me** and labels every result **AI visualization, not a fit guarantee**. It never calls the result 3D because the output is a single raster image, not a rotatable body or garment model.

## Experiment findings

The feasibility experiment paired a clearly adult, full-body studio photo with Yange’s cream blouse. Google `virtual-try-on-001` produced a 1237 × 1920 PNG in roughly 32 seconds. The result preserved the person’s identity, pose, trousers, shoes and background while recreating the blouse’s collar, buttons, pocket, cuffs and curved hem. The main defects were slight fabric smoothing and loss of a small wrist accessory.

An earlier ambiguous portrait was blocked by the adult-only person-generation policy. The experiment kept that policy and replaced the test input; it did not weaken the model to all-ages generation. This directly shaped the production boundary.

The local experiment files are excluded from Git because the third-party sample image’s redistribution rights were not verified. Submission evidence must use a consenting adult’s own photo.

Official references:

- [Google Virtual Try-On model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/vto/virtual-try-on-001)
- [Google Virtual Try-On generation guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/generate-virtual-try-on-images)
- [Google generative AI pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)

## Enforced constraints

1. The user must reserve an outfit first.
2. Only a user-added, photographed top or outerwear piece in that reserved outfit is eligible.
3. The user explicitly confirms they are 18 or older, control the photo, and accept regional private processing.
4. Every request contains one person image, one garment image and requests one result.
5. The model request keeps `personGeneration: allow_adult`, `safetySetting: block_medium_and_above`, watermarking and PNG output.
6. The person image is uploaded through a short-lived signed URL and deleted after every terminal attempt, including a safety block.
7. The result is private, receives a five-minute signed read URL and enters the bucket’s `temporary/` lifecycle for deletion after one day. Lifecycle deletion is asynchronous; the user can delete it immediately.
8. Each user partition can start at most four generations per UTC day. Ambiguous retries use stable job IDs, and completed identical asset pairs use the cache.
9. Cloud Tasks runs generation on the private worker. The user can continue using Yange and recover the job after navigating away.
10. Logs and task payloads contain identifiers and receipts, never person or garment pixels.
11. Mirror jobs live outside the domain ledger. No Mirror status can emit wardrobe events or affect a deterministic decision.

## Honest limitations

- The initial release previews one top or outerwear piece. It does not reproduce a complete layered outfit.
- The output may smooth fabric, omit small accessories, alter drape or invent small details.
- It does not estimate size, measurements, comfort, mobility or real-world fit.
- A clear head-to-toe adult photo with good light produces the best result.
- Generation is asynchronous because the measured model call took about half a minute. The outfit recommendation is available immediately and never waits for Mirror.
- Yange’s core data remains in `africa-south1`; the currently proven Mirror model call uses `europe-west1`, a supported Google region. The consent screen names this boundary before upload.

## Cost control

Google prices Virtual Try-On per generated image. Yange requests one image only, never runs automatically, caps each user at four starts per day, caches safe retries and limits the Cloud Tasks queue to one concurrent dispatch. The exact price should be confirmed from the official pricing page before submission because model pricing can change.
