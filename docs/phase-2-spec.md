# Yange Phase 2 specification

## Outcome

Phase 2 turns Yange's seeded Wardrobe Digital Twin into a credential-free, multimodal onboarding experience. A participant can add a garment from a photo, optionally scan its care label, correct every extracted fact, save personal Style DNA, and decode an inspiration image into reusable Look DNA.

The local adapter is deliberately honest: it simulates Gemini deterministically so the complete workflow can be developed and judged without credentials. Phase 5 replaces the adapter, not the user experience or domain rules.

## Product principles

1. **The model suggests; the user owns the facts.** AI output is never disguised as certainty.
2. **Care is safety-critical.** Label-derived and AI-estimated care instructions remain `needs-review` until the user confirms or edits them.
3. **Personalisation is descriptive, not judgmental.** Height, colour relationship, fit, and comfort preferences shape options; they never produce an attractiveness score.
4. **Images are private by default.** Phase 2 processes and stores them on-device. The event ledger contains opaque asset IDs, never image bytes.
5. **One failed capability must not break the wardrobe.** Capture, analysis, Style DNA, and inspiration each have isolated error and retry states.

## Architecture

```text
Accessible React capture experience
        |
Browser image pipeline
  allowlist -> signature check -> decode -> resize -> rewrite
        |
IndexedDB media repository -------- Event ledger stores asset IDs only
        |
Versioned @yange/contracts port
        |
Deterministic fake Gemini adapter now / Vertex AI adapter in Phase 5
        |
User review and correction
        |
Validated domain command -> append-only event -> replayed Digital Twin
```

## Versioned multimodal contract

Contract version `1.0` supports two request modes:

- `garment`: one garment image plus an optional care-label image.
- `look-dna`: one inspiration image.

Every response is runtime-validated before the UI can use it. Responses carry:

- contract and request identifiers;
- adapter identity;
- generated timestamp;
- field-level value, provenance, confidence, and review status;
- warnings that explain uncertainty or missing evidence.

The production Vertex AI adapter will request structured JSON using the same schema. Google Cloud documents response-schema controlled JSON output and multimodal JPEG/PNG/WebP inputs, so the local contract does not need to change when credentials are introduced.

## Upload and privacy boundary

- Accepted types: JPEG, PNG, WebP.
- Maximum source size: 12 MB per image.
- MIME type, extension, and binary signature are checked.
- The browser decodes the image and rewrites it to WebP, stripping unrelated metadata and active payloads.
- Maximum edge: 1600 px; output quality: 0.84 for garments and 0.9 for care labels.
- Blob URLs are revoked when previews are replaced or unmounted.
- Rewritten blobs are stored in IndexedDB, which supports structured storage of `Blob` values.
- Original filenames are display metadata only; storage keys are generated UUIDs.

These choices follow the [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), the [W3C File API](https://www.w3.org/TR/FileAPI/), the [WHATWG `createImageBitmap` definition](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html), and the [W3C IndexedDB specification](https://www.w3.org/TR/IndexedDB/).

## Domain additions

### Garment evidence

Each editable fact is an evidenced value:

- `user-confirmed`
- `label-extracted`
- `ai-estimated`

Each value also records confidence and either `confirmed` or `needs-review`. Domain validation rejects non-user evidence presented as confirmed.

### Style DNA

User-controlled fields:

- optional height in centimetres;
- self-selected colour relationship;
- preferred and avoided colours;
- preferred fits;
- comfort priorities;
- personal style words.

### Look DNA

An inspiration image produces:

- palette;
- silhouette;
- key pieces;
- layering structure;
- styling cues;
- occasion cues;
- overall confidence.

Yange analyses the outfit, not the person's identity or attractiveness.

## Resilience states

Every capture slot can be:

- empty;
- validating;
- compressing;
- ready;
- analysing;
- failed and retryable.

The original `File` is retained only in memory for retry. Replacing or removing a capture deletes its temporary stored blob. Unsupported files, invalid signatures, oversized images, decode failures, unavailable IndexedDB, and malformed adapter responses all receive specific user-facing messages.

## Acceptance gates

- A real file or built-in demo capture can travel through the same image pipeline.
- A garment can be reviewed, corrected, and added to the replayed Digital Twin.
- Unreviewed care facts are visibly marked and cannot silently become confirmed.
- Style DNA survives reload through the event ledger.
- Look DNA survives reload through the event ledger.
- Analysis failures can be retried without reselecting the image.
- Existing Phase 1 ledgers continue to replay.
- Desktop and 390 px mobile layouts have no horizontal overflow.
- Keyboard-visible focus, labelled controls, live status, and reduced motion are supported.
- Tests, type checking, production build, browser console, and dependency audit pass.

