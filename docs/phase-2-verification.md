# Phase 2 verification record

Phase 2 was verified on 14 August 2026 in credential-free local mode.

## Automated gates

Run from the repository root:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high
```

Expected coverage:

- `@yange/domain`: event replay, idempotency, garment provenance, care-safety rejection, Style DNA, and Look DNA.
- `@yange/contracts`: deterministic multimodal results, response parsing, unsafe auto-confirmation rejection, and fail-once retry.
- `@yange/web`: resize math for portrait and landscape images.
- Production Vite bundle plus strict TypeScript compilation for all workspaces.
- Dependency advisory check: zero known vulnerabilities at verification time.

## Browser walkthrough

The following path was exercised in the in-app Chromium browser:

1. Open Wardrobe Studio at a desktop viewport.
2. Generate both built-in garment and care-label demo captures.
3. Confirm that the same validation, rewrite, compression, storage, and preview path used for real files runs.
4. Trigger **Run resilience drill** and observe isolated, retryable adapter failure.
5. Retry analysis without reselecting either image.
6. Edit the garment name and observe provenance change to `User confirmed`.
7. Confirm that **Add to my wardrobe** remains disabled until care facts are reviewed.
8. Review and save the garment; observe the event count and private capture shelf update.
9. Change and save Style DNA.
10. Generate an inspiration capture, extract Look DNA, and save it.
11. Reload and confirm the garment thumbnail, profile event, Look DNA, and image blobs remain available.
12. Switch to a 390 × 844 viewport and verify no horizontal document overflow.
13. Reset the demo and confirm the event ledger and capture shelf are cleared.

Observed results:

- Failure/retry, explicit review, correction provenance, save, reload, and reset passed.
- Desktop and 390 px mobile layouts passed without document overflow.
- Browser console contained no warnings or errors.
- The temporary mobile viewport was reset after testing.

## Honest local-mode boundary

The adapter identifies itself as `fake-gemini-local-v1`. It produces deterministic fixtures and supports deliberate failure injection. This is not presented as live Gemini. The production boundary is the `MultimodalAnalyzer` interface and version `1.0` runtime parser; connecting Vertex AI is a later credentialed phase.
