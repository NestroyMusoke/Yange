# I Lost 30 Minutes a Day to My Closet, So I Built an Agent That Remembers What I Can’t

*The styling model was the easy part. The hard part was building a wardrobe agent that could survive laundry, Kampala weather, retries, and its own failures.*

Some mornings I lost 30 minutes to my own closet. Yange ended that.

I did not lack clothes. I lacked a reliable memory of them.

Standing in front of my wardrobe in Kampala, Uganda, I was trying to remember too many moving facts at once: what I wore recently, what was still clean, which clothes I was overusing, what needed washing, where I was going, how the weather might change, and whether an outfit would feel right once I left home.

The easiest answer was usually the same familiar shirt and trousers. That saved a decision, but wore out the clothes I loved while other pieces sat untouched.

Laundry made the problem worse. I would reread small care tags one by one, try to decode their symbols, separate materials, and hope I had chosen a day when the clothes could actually dry. A 2017 UK survey of 500 people found that [56% did not always understand clothing-care symbols](https://www.laundryandcleaningnews.com/news/over-half-of-people-find-clothing-care-labels-confusing-5768936/). In a [2023 study of 159 Family and Consumer Sciences students in Ghana](https://www.scipublications.com/journal/index.php/jad/article/view/703), 42.1% did not understand the information on care labels.

I knew that frustration before I knew how I would engineer the solution.

So I built **[Yange](https://yange-kdxt2klboq-bq.a.run.app/)**, a personal wardrobe agent that remembers what is available, plans for what is coming, learns from how I felt wearing its choices, and acts before laundry disrupts the week.

In Luganda, *yange* means **mine**.

That is the promise: my wardrobe, my evidence, my preferences, and an agent that learns me instead of issuing generic rules about what should look good on me.

> **VISUAL 1: LIVE PRODUCT GIF**  
> File: `docs/assets/yange-product-demo.gif`  
> Caption: *A live capture from the deployed product. Wearing one outfit updates five garment states, opens a Confidence Check-in, and begins changing the personal Style Aura.*

## A wardrobe is a state machine hiding in a bedroom

My first instinct was to build an outfit recommender. Photograph some clothes, describe the occasion, ask Gemini to choose.

That would have produced a clever demo and an unreliable product.

A useful outfit cannot contain a blouse that is wet, trousers reserved for tomorrow, or a jacket whose care evidence is unknown. A good recommendation is not simply a visually pleasing combination. It is a valid decision over objects whose state keeps changing.

That realization changed the architecture.

Every garment in Yange can move through states such as available, worn, rewearable, airing, reserved, or laundry. Wearing an outfit does not mark everything dirty. A cotton blouse may need washing. Jeans may remain rewearable. A jacket may only need airing. Shoes can remain available.

Yange stores those changes in an append-only event ledger and rebuilds the current wardrobe from them. The recommendation engine sees the wardrobe as it is now, not as it looked when the user first uploaded ten photographs.

This is the difference between a chatbot that talks about clothes and an agent that can be trusted with tomorrow.

## One Friday explains the whole product

Imagine I am planning for dinner on Friday.

I photograph a shirt and its care label. Yange removes the background on-device, then Gemini 3.5 Flash Lite extracts observable details into a versioned contract: garment type, colours, material clues, and care symbols. Uncertain evidence stays uncertain until I confirm it.

I can type what I need, or upload a Pinterest image or a saved frame from a social video. Yange uses the inspiration without pretending I own the clothes in it. It searches only the garments that are available in my wardrobe.

The outfit engine applies hard constraints first, then scores feasible combinations against weather, occasion, care practicality, comfort, and learned preferences. Gemini 3.5 Flash explains the result in natural language, but it cannot quietly swap the garments or override availability.

After I wear the outfit, Yange asks for a simple Confidence Check-in. If I say the colours felt right, that is stronger evidence than a broad five-star rating. If the colours felt wrong, Yange records negative evidence instead of treating every interaction as approval.

The garment states change. If Friday’s plan now depends on a dirty blouse, Yange looks ahead. It checks the forecast, finds the best washing and drying opportunity, separates compatible garments using their confirmed care evidence, warns me before the risk becomes urgent, and reserves a valid fallback if recovery is uncertain.

The user should not have to ask the same question again to discover that reality has changed. That is where the agent earns its place.

> **VISUAL 2: THE WARDROBE BECOMES EVIDENCE**  
> File: `docs/evidence/visual-qa/studio.png`  
> Caption: *Studio turns garment photos and care labels into reviewed wardrobe evidence. Unknown care fails closed instead of becoming a confident guess.*

## Why Kampala weather belongs in a fashion decision

I live in Uganda, where the practical question is not only “Will this look good?” It is also “What happens if the weather changes before I get home?”

A warm morning can become a wet afternoon. Washing clothes without considering the next drying window can leave a planned garment unavailable exactly when I need it.

That is why Yange’s seven-day planning loop uses Google Weather data as operational context. It does not add a weather icon to an outfit card and call that intelligence. It compares the cost of doing nothing with the benefit of acting now.

If half of the core wardrobe is moving toward laundry, the agent can surface the pressure early. If a future outfit depends on one of those garments, it can find a safer laundry window or protect the event with another outfit.

Weather becomes part of wardrobe memory.

> **VISUAL 3: WEARCAST**  
> File: `docs/evidence/visual-qa/wearcast.png`  
> Caption: *WearCast combines real garment availability, care-safe wash groups, a seven-day forecast, and upcoming plans before it recommends action.*

## The cherry on top became the most personal part

I did not want Yange to feel like another static tool that collects preferences and hides them in a database.

I do not have many friends who take the time to learn small personal details about me, like the colours I return to or the choices that make me feel confident. While building Yange, I kept thinking about what it means to feel remembered. If this agent was going to learn a person over time, I wanted that care to be visible.

That thought became the **Style Aura**: a living WebGL aurora behind the interface, inspired by northern lights suspended in dark water.

It begins with colours the user chooses explicitly. Confirmed colours from inspiration images and wardrobe items add weaker evidence. Confidence Check-ins add lived evidence. A user can say “the colours felt right” or “the colours felt off,” and inspect why emerald, rose, cyan, or violet is moving in the palette.

The Aura never snaps to a new personality after one click. Its displayed palette can advance no more than 8% toward a new target after one changed evidence signature. Repeated evidence builds certainty gradually.

That restraint is important. Yange should feel like a friend learning you, not an algorithm announcing that it has figured you out.

The Aura is also deliberately powerless. It receives four colour targets and motion settings, but it cannot change wardrobe state or influence an outfit score. If WebGL loses its context, Yange replaces it with an accessible still and every product action remains available.

The emotional layer can fail without taking the useful friend with it.

## The AI is not allowed to choose

The central engineering rule in Yange is simple:

> **AI proposes. Validated domain rules commit.**

Google’s models do what they are good at. Gemini 3.5 Flash Lite extracts structured evidence from garment, care-label, and inspiration images. Gemini 3.5 Flash explains an already-computed recommendation and supports a supervised Google ADK agent with two narrow tools. Google Virtual Try-On can create an optional preview of one selected top or outerwear piece.

None of those models owns the wardrobe.

Pure TypeScript domain rules decide availability, state transitions, outfit feasibility, care compatibility, laundry pressure, and whether a proposed action is safe to commit. The model cannot invent a garment, wash an unknown fabric, mutate a score, or bypass the user’s evidence.

In production, the browser sends a validated command to a public Cloud Run edge. Cloud Tasks dispatches long-running work to a private worker with OIDC authentication. The worker rebuilds the wardrobe projection from Firestore, reads Google Weather and optional Calendar context, simulates the decision, and commits the event, projection, and outbox atomically. Pub/Sub and notification delivery continue from durable checkpoints.

> **VISUAL 4: ARCHITECTURE**  
> File: `docs/assets/yange-architecture-medium.png`  
> Caption: *The public edge, private worker, Google models, deterministic decision authority, and transactional evidence path. A model proposal never writes wardrobe state directly.*

## The hardest part was surviving failure

The outfit explanation was not the hardest part of the build. Failure was.

Cloud Tasks can deliver work more than once. A notification can fail after the safe wardrobe action has already committed. A model can return malformed JSON. Weather or Calendar can disappear. A browser can lose its WebGL context. A long-running image generation can time out after the rest of the outfit is ready.

I built Yange so those failures stay inside their own boundaries.

In one test, I deliberately failed notification delivery after 12 valid intervention events had committed. The wardrobe decision stayed intact. Three outbox messages remained queued. On retry, the workflow skipped four completed checkpoints, delivered each notification once with stable idempotency keys, and finished. Replaying the exact scheduler trigger changed only the duplicate counter. It did not create another reservation, event, or message.

A real deployment uncovered a less theatrical bug. Some early Firestore wardrobe projections predated the newer `userProfile` shape. The scheduled worker expected location fields that those records did not contain. Instead of discarding the old users or hiding the failure, I added a safe seed-profile fallback for legacy projections and a regression test before redeploying both services.

Yange Mirror produced another useful limit. Google’s `virtual-try-on-001` generated a 1237 × 1920 preview in roughly 32 seconds and preserved the person’s identity, pose, trousers, shoes, and background. It also smoothed the fabric and removed a small wrist accessory. An earlier ambiguous portrait was correctly blocked by the adult-only safety policy.

I kept the policy and narrowed the product. Mirror now accepts one photographed top or outerwear piece from a consenting adult, runs asynchronously, stores temporary media privately, and labels every result **AI visualization, not a fit guarantee**. A failed or blocked preview cannot change the selected outfit, learned preferences, or wardrobe ledger.

The failures shaped the product more than the happy path did.

## What is live, and what is not

Yange is running on Google Cloud today:

- **[Live product](https://yange-kdxt2klboq-bq.a.run.app/)** on a public Cloud Run edge
- Private Cloud Run worker and Google ADK service
- Gemini 3.5 Flash Lite for multimodal evidence extraction
- Gemini 3.5 Flash for explanation and supervised agent reasoning
- Firestore transactions, private Cloud Storage, Cloud Tasks, Pub/Sub, and Google Weather
- 108 automated TypeScript tests, strict typechecking, and production builds
- **[Open-source repository](https://github.com/NestroyMusoke/Yange)** with the architecture, deployment path, tests, and dated evidence

There are limits I will not hide.

Google Calendar is an optional read-only adapter and is not connected in the public deployment. A user can still supply an occasion manually. Direct TikTok ingestion is not implemented; the safe path is a user-saved inspiration frame. Mirror previews one top or outerwear piece, not a complete layered outfit, and it does not estimate size or comfort. Local shopping and price discovery are future work because Yange should first prove that a new purchase fills a real wardrobe gap.

Those are boundaries, not missing adjectives.

## What I was really building

Yange began as a way to recover 30 minutes from my morning.

It became an attempt to make software feel attentive again.

Not attentive because it sends more messages, or because it claims to know what makes a body attractive. Attentive because it remembers the quiet details I would otherwise carry alone: the blouse waiting for laundry, the Friday plan depending on it, the rain that may delay drying, the colour that repeatedly made me feel good, and the clothes I already own but keep forgetting.

Technology becomes meaningful when it is shaped around a real experience. Yange is my experience of decision fatigue, Kampala weather, clothing care, confidence, and wanting to feel known, translated into a system that may help many other people too.

If you try **[Yange](https://yange-kdxt2klboq-bq.a.run.app/)**, I would love to know one thing: **what wardrobe fact are you tired of keeping in your head?**

---

*Built by Musoke Nestroy in Kampala, Uganda. [Explore the code and technical evidence on GitHub](https://github.com/NestroyMusoke/Yange).*

*I created this story for the purpose of entering the All Things Agentic Hackathon. The hackathon gave Yange a deadline and a stage, but not its reason to exist. That came from my own mornings in Kampala, my love of fashion, and the hope of building technology that makes people feel remembered.*
