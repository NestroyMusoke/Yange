# Yange demo film: proof with a pulse

## Creative thesis

The film is **cinema wrapped around an uninterrupted live demonstration**.

The generated shots establish the human problem and emotional resolution. They never show a fake interface, invent a capability, or substitute for product proof. The centre of the film is one continuous recording on the deployed Cloud Run URL with a visible cursor, real clothing, live Google context, and state changes that survive navigation.

The judge should leave with one sentence in mind:

> Yange does not merely recommend an outfit. It remembers what is wearable, learns from lived confidence, and acts before weather and laundry break a future plan.

## What the winning-demo research changes

Strong hackathon demos share five traits:

1. The human problem is clear before the architecture appears.
2. A real input becomes a visible result inside the running product.
3. One causal story replaces a tour of every feature.
4. Technical claims are paired with inspectable proof.
5. The ending resolves the problem introduced in the first seconds.

For Yange, the causal spine is:

```text
real garment + care label
        ↓
confirmed wardrobe evidence
        ↓
inspiration + Kampala forecast + occasion
        ↓
feasible outfit + Personal Match receipt
        ↓
worn state + Confidence Check-in
        ↓
material-aware laundry state + evolving Style Aura
        ↓
future outfit risk detected
        ↓
drying window + safe wash groups + fallback + notification
        ↓
durable Cloud checkpoint receipt
```

## Four-minute master timeline

Target runtime: **3:52 to 3:58**. Never exceed the event limit.

| Time | Picture | Narration purpose | Judge evidence |
|---|---|---|---|
| 0:00-0:07 | Veo shot A: the wardrobe loop | Open on the lived problem, not a logo | Desirability and originality |
| 0:07-0:17 | Real phone footage: Musoke, one shirt and its care label | Establish that this was built from personal friction | Human credibility |
| 0:17-0:25 | Real Yange Aura and title | State the product thesis in one breath | Visual identity |
| 0:25-2:47 | **Single uninterrupted live Yange take** | Turn real evidence into action | Operational utility, multimodality, memory, state |
| 2:47-3:31 | Real Google Cloud proof plus architecture | Prove the running system and failure boundaries | Architecture and production readiness |
| 3:31-3:43 | Optional Mirror result and Style Aura close-up | Show the future-facing, personal layer without distracting from the core | Bonus Google model and emotional payoff |
| 3:43-3:55 | Veo shot B: the resolved morning | Close the human loop | Memorability |

### Time allocation by judging weight

- Operational utility: about 160 seconds.
- Architecture and Google Cloud proof: about 44 seconds.
- Story and visual bookends: about 31 seconds.
- Production readiness is visible throughout through the live URL, stable UI, real input, receipts, and clean capture.

## Act 1: the problem, 0:00-0:25

### Veo shot A: The wardrobe loop

Duration: 6 seconds, 16:9, 24 fps, 720p, video only.

Use `veo-3.1-lite-generate-001` in `us-central1` if the project has model quota. Generate two variants only. Add all titles later in the editor, never inside the generated shot.

**Prompt**

```text
A restrained cinematic fashion film set in a real Kampala bedroom just after sunrise during rainy season. An adult Black Ugandan man is seen only from behind and in partial profile, standing before an ordinary, well-used wardrobe containing shirts, trousers and jackets in cream, olive, chocolate and indigo. He lifts one shirt, doubts it, returns it, then reaches for another as a small analog clock on a nearby table advances noticeably. Soft overcast daylight from a window, faint rain on the glass, natural dark wood and woven Ugandan textile details, quiet human realism, no luxury showroom. Slow deliberate 50 mm camera drift from left to right, shallow but believable depth of field, editorial composition, deep emerald shadows and restrained champagne highlights, fine film grain. Clothing, hands and wardrobe remain physically consistent. No spoken dialogue, no captions, no text, no logos, no phone interface, no holograms, no magical effects, no exaggerated frustration. The feeling is intimate decision fatigue, not comedy. 16:9, 24 fps, six seconds.
```

**Negative direction**

```text
Avoid deformed hands, changing garments between frames, duplicate hangers, fashion-runway staging, neon cyberpunk light, floating UI, readable brand labels, dramatic acting, camera shake, rapid cuts, synthetic skin, text and watermarks.
```

### Real camera insert

Film this on the phone in landscape, locked exposure, 4K if available:

- close shot of the real shirt on a hanger;
- turn the collar or side seam to reveal the physical care label;
- hold for one full second on the symbols;
- no talking to camera is required.

This six-to-ten-second real insert prevents the opening from feeling like an advertisement for a product that does not exist.

### Opening narration

> Some mornings I lost thirty minutes to my own closet. I forgot what was clean, repeated the same clothes, misread care labels, and still had to guess what Kampala's weather would do next. So I built Yange.

On screen at 0:17, added in the editor:

```text
Yange
Your wardrobe, thinking ahead.
```

## Act 2: the uninterrupted live product take, 0:25-2:47

Record on the deployed URL at 1440 by 900 or 1920 by 1080. Keep the address visible for the first three seconds, then enter full screen. Add a small, static `LIVE PRODUCT • CLOUD RUN` label in the edit. Do not speed up, hide loading, or cut around a failure.

### Before the take

- Use a browser profile dedicated to the recording. Before the take, open Wardrobe once and let the private cutout runtime cache finish downloading. Then reset only Yange's wardrobe journey, not the browser cache. This is normal production asset caching, and it keeps the on-camera work focused on the live garment rather than a one-time 18 MB runtime download.
- Keep the sample wardrobe available so one real upload can join enough pieces to form complete outfits.
- Prepare three permitted local files with short names:
  - `01-real-shirt.jpg` from `blackshirt.HEIC`
  - `02-care-label.jpg` from `blackshirt_caretag.HEIC`
  - `03-inspiration.jpg` from `inspo.jpg`
- Use a clear, full-outfit inspiration image that Musoke created, licensed, or has permission to show. Do not display the Pinterest or TikTok interface.
- Keep the original patterned-background shirt photo for the live take. It makes the transition to the clean wardrobe view visibly undeniable.
- Confirm the live runtime reports Google mode and ready.
- Rehearse the exact clicks three times with the same viewport and cursor speed.
- Disable notifications, browser extensions, password prompts and unrelated tabs.

### Shot L1: evidence enters the wardrobe, 0:25-1:03

1. Open **Wardrobe**.
2. Upload the real shirt and care-label close-up.
3. Click **Analyse this garment**.
4. While analysis runs, point to **Preparing a clean wardrobe view**. This is useful work happening in parallel, not dead time.
5. Show the extracted name, category, colour, material and care facts.
6. Check the physical-label confirmation and save.
7. Briefly switch from **Original** to **Clean view** when the cutout is ready.

Narration:

> I photograph one piece and its care label. The image is checked, stripped of metadata and privately prepared. Gemini extracts evidence into a versioned contract, but uncertain care facts cannot enter the wardrobe until I confirm them. Background removal happens on the device, in parallel, so the wardrobe stays visually clean without slowing the decision.

Visible proof:

- real multimodal input;
- schema-constrained extraction;
- human confirmation boundary;
- on-device background removal;
- persisted personal garment.

### Shot L2: inspiration becomes a constraint, 1:03-1:23

1. Select **Inspiration** inside Wardrobe.
2. Upload `03-inspiration.jpg`.
3. Click **Extract Look DNA**.
4. Show palette, silhouette, key pieces and styling cues.
5. Save it to inspiration memory.

Narration:

> An inspiration image is not copied blindly. Yange extracts its palette, proportions and styling logic, then stores that as evidence it can recreate only with clothes I actually own.

### Shot L3: plan from reality, 1:23-1:54

1. Open **Outfits**.
2. Keep **Live weather** selected.
3. Enter one concrete occasion, such as `Friday rooftop dinner`.
4. Choose the saved inspiration memory.
5. Click **Find outfit options**.
6. Show the leading candidate, its real garment photographs, Personal Match score and five-factor receipt.
7. Click **Plan and reserve**.

Narration:

> For Friday, Yange combines the occasion, Kampala's live forecast, what is available, what needs care and what I have felt confident wearing. Rules create and rank only feasible outfits. Gemini explains the result, but it cannot invent clothes, change the score or override availability.

### Shot L4: lived confidence becomes memory, 1:54-2:15

1. Open **Today**.
2. Mark the outfit worn.
3. Show the material-aware state changes: wash, air, rewear or remain available.
4. Record one Confidence Check-in.
5. Open **Style Aura** long enough to show its evidence counts and evolving colourways.

Narration:

> After I wear it, each material moves differently. The blouse may need washing, the trousers may be rewearable, the jacket may only need airing. My Confidence Check-in teaches future recommendations, and the Aura changes gradually so learning is visible, not hidden behind a chatbot.

### Shot L5: the agent acts before Friday, 2:15-2:47

1. Open **Laundry**.
2. Stage the wardrobe-pressure scenario.
3. Run the connected check.
4. Show the Kampala drying horizon, safe wash groups, endangered Friday dependency, fallback and notification.
5. End on the saved checkpoint receipt.

Narration:

> That wear changes Friday's plan. Yange projects the wardrobe forward, notices the dependency, checks the drying forecast, separates garments by care compatibility and acts before the outfit fails. It can recommend the washing window, reserve a verified fallback and send one idempotent warning with no hand-holding.

## Act 3: proof that survives narration, 2:47-3:31

These are real recordings, never generated graphics pretending to be consoles.

### Shot P1: public runtime receipt, 2:47-2:55

Open the public `/v1/runtime` response. Highlight only:

- `mode: google`;
- `ready: true`;
- `decisionAuthority: deterministic-domain`;
- Gemini multimodal and explanation model boundaries;
- Firestore persistence and Cloud Tasks plus Pub/Sub transport.

Narration:

> The public receipt proves this is the Google runtime, not a local simulation.

### Shot P2: live Cloud Run services, 2:55-3:04

Show the GCP console with:

- public `yange` edge and its serving revision;
- private `yange-worker` revision;
- private Google ADK steward;
- 100 percent traffic on the expected revisions.

Blur only account identifiers that are not already public. Never expose credentials, cookies, signed URLs or bucket paths.

Narration:

> A public Cloud Run edge accepts commands. A private worker rebuilds state and revalidates every action. A separate ADK steward can inspect and request two narrow tools, but it cannot write the wardrobe directly.

### Shot P3: architecture and trace, 3:04-3:19

Animate a slow push over `docs/assets/yange-architecture.svg`. Highlight the path in this order:

```text
Cloud Run edge → Cloud Tasks → private worker → Firestore transaction
                                      ↓
                              Pub/Sub and notification
```

Then cut to one matching structured log or trace ID and the six-checkpoint receipt.

Narration:

> Every mutation is event-sourced. Long work resumes from durable checkpoints, and the event, projection and outbox commit atomically.

### Shot P4: failure is isolated, 3:19-3:31

Use the explicit deterministic failure control, labelled on screen as a failure test:

1. let the valid intervention commit;
2. fail notification delivery;
3. resume the same trigger;
4. show completed checkpoints, one delivery and the duplicate ignored.

Narration:

> Here notification delivery fails after the wardrobe decision is committed. The same run resumes at the failed checkpoint. Completed work is skipped, the notice is delivered once, and replay creates no second side effect.

## Act 4: the personal future, 3:31-3:55

### Product coda, 3:31-3:43

Use two short real captures:

- the optional Yange Mirror result, clearly labelled `AI visualisation, not a fit guarantee`;
- the Style Aura moving in the learned palette with its evidence explanation visible.

Narration:

> Yange can optionally visualise one selected piece, but the preview never decides the outfit. The final signature is quieter: as Yange gathers real colour evidence, the living Aura becomes different for every person.

### Veo shot B: The resolved morning

Duration: 6 seconds, 16:9, 24 fps, 720p, video only.

Create the first frame from the same room, wardrobe and palette used for shot A so the ending reads as resolution, not an unrelated stock scene.

**Prompt**

```text
Continuation of the same restrained cinematic fashion film in the same real Kampala bedroom, same rainy-season morning, same adult Black Ugandan man seen from behind, same wardrobe and physically consistent cream, olive, chocolate and indigo garments. The chosen cream shirt and olive layer are already prepared together on one hanger. In one calm movement he takes the prepared outfit, closes the wardrobe, picks up his keys and exits frame as gentle rain begins beyond the window. The analog clock now remains still. Soft overcast daylight, natural dark wood and subtle woven Ugandan textile detail, deep emerald shadows, restrained champagne highlights, fine film grain, believable human motion. A very faint reflected ribbon of emerald and violet light moves across the wardrobe glass like an atmospheric echo of Yange's Style Aura, never a hologram and never attached to the person. Slow 50 mm pull-back, quiet relief, no celebration. No dialogue, captions, text, logos, phones, interfaces or magical effects. 16:9, 24 fps, six seconds.
```

**Negative direction**

```text
Avoid wardrobe or clothing continuity changes, deformed hands, duplicate garments, luxury showroom styling, neon light, floating interfaces, readable labels, dramatic rain, smiles to camera, fast cuts, text and watermarks.
```

Final narration:

> I built Yange because an agent should not wait for another question. It should remember what matters, act before friction arrives, and make the person using it feel known.

Final editor-added card:

```text
Yange
My wardrobe. My evidence. My tomorrow.
```

## Narration performance

- Musoke's own voice is an advantage. Keep the Ugandan voice and rhythm; do not imitate a generic trailer voice.
- Aim for 125 to 135 words per minute.
- Record in a quiet soft-furnished room, phone 15 to 20 cm from the mouth, airplane mode on.
- Record each act as a separate take, then one full read for emotional continuity.
- Smile slightly only during the Aura and closing lines. Let the failure proof sound calm and factual.
- Never narrate every click. Explain why the visible state change matters.

## Music and sound

- Use one licensed or original instrumental bed, not a dramatic technology trailer track.
- Begin with wardrobe room tone and light Kampala rain.
- Introduce a restrained pulse at the first live product action.
- Remove most music under the failure and Cloud proof section so clicks and narration feel credible.
- Let a warmer melodic element enter only when the Aura appears.
- Keep music roughly 18 to 24 dB below narration. No lyrics.

## Editing grammar

- 16:9 master, 1920 by 1080, 24 or 30 fps.
- Product capture stays at native sharpness. Never place it in a tilted laptop mockup.
- Use hard cuts for proof, two gentle dissolves only for the opening and closing Veo transitions.
- Use Yange emerald, champagne and General Sans for editor titles.
- No kinetic subtitle template, fake terminal text, lens-flare pack, glitch, typing animation or floating technology particles.
- Caption all narration. Keep captions to two lines and out of the product controls.
- Every architecture highlight must correspond to something visible in the real runtime or trace.
- Generated shots receive a small end-credit disclosure: `Opening and closing visual inserts generated with Google Veo 3.1; all product and Cloud footage is real.`

## Capture package

Use these exact filenames so the final edit is difficult to mix up:

```text
01-veo-wardrobe-loop-v1.mp4
02-real-shirt-care-label.mp4
03-yange-live-single-take.mp4
04-runtime-receipt.mp4
05-cloud-run-services.mp4
06-architecture-trace.mp4
07-failure-resume.mp4
08-mirror-aura-coda.mp4
09-veo-resolved-morning-v1.mp4
10-musoke-narration.wav
11-music-licensed.wav
```

## Cost and generation guardrail

Veo 3.1 Lite is currently a preview model and may require project quota in `us-central1`. At the current listed video-only 720p price of about **$0.03 per generated second**, two six-second shots with two variants each are about **$0.72** before storage, taxes or reruns. Set a strict creative-generation ceiling of **$2** and stop after four variants. Confirm the live console price before generation.

The film does not depend on Veo access. If quota is unavailable, replace both generated shots with carefully framed real phone footage. The submission remains credible because the product and Cloud proof are the centre of the film.

## Final quality gates

Do not publish until every answer is yes:

- Does the first ten seconds make the problem understandable without jargon?
- Is the main Yange journey one continuous real take?
- Does a real garment and physical care label enter the system?
- Can a judge see the original input, extracted evidence and committed result?
- Is the outfit visibly restricted to owned, available garments?
- Does one worn action cause material-specific state changes?
- Does the agent act on a future risk without another chat request?
- Are Google mode, serving revisions, trace/checkpoints and architecture all visible?
- Is the failure recovery labelled honestly and free of duplicate side effects?
- Are generated shots clearly aesthetic bookends rather than product proof?
- Are all credentials, signed URLs and private identifiers absent?
- Is the final export below four minutes and intelligible with music muted?
- Does the ending answer the human problem introduced at the beginning?

## Recording order

Record in risk order, not edit order:

1. Rehearse and capture the uninterrupted live product take.
2. Capture the runtime, Cloud Run, trace and failure proof.
3. Capture the architecture move, Mirror result and Aura.
4. Film the real shirt and care-label insert.
5. Generate the two optional Veo shots after the proof footage is secure.
6. Record narration against a rough cut.
7. Add music, captions, disclosure and final loudness pass.

This protects the submission from spending time on cinematic material before the unforgeable proof is complete.
