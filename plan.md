# Buzz Content-Quality Adoption Plan

What to adopt from the OpenMontage study (+ the layout/judge research) to make image
and video output look creatively directed instead of AI slop.

**Hard constraint:** free/local tools only — ffmpeg, ffprobe, Remotion (headless
Chrome), sharp — plus the LLM CLIs we already pay for (Claude Code, Codex, agy).
No paid generation or evaluation APIs.

**Already shipped (context, not tasks):** image fit-to-box typography + flow bands;
image archetype vocabulary + relational decor; hero ≥ 3× kicker; pairwise
order-swapped vision judge (round-robin, tie-on-disagreement); background cache;
product-screenshot letterboxing.

---

## MUST — broken or contradictory today; everything else stacks on these

- [ ] **M1. Port the image fixes into video** (`src/remotion/SpecVideo.tsx`, `spec.ts`)
  The video spec still has everything we just cured for images: free-floating
  `{shape, xPct, yPct}` layers, five position enums, longest-word text sizing.
  Port: fit-to-box (`text-fit.ts`), flow-layout bands (fixed slots), relational
  decor replacing coordinate shapes, per-font real weights, balanced line breaks.

- [ ] **M2. Judge video by pixels, not JSON summaries**
  Video best-of-N still judges spec summaries — the exact "art-directing over the
  phone" failure images had. Cheap route (their trick): extract 4 frames at
  10/35/65/90% via ffmpeg, feed the stills to the existing pairwise judge
  (`vision-judge.ts` works unchanged on stills).

- [ ] **M3. Post-render self-review for every video** (new `src/lib/video/final-review.ts`)
  We currently never look at finished renders. All free:
  - ffprobe: valid container, duration vs target (>25% drift = flag), resolution,
    audio stream present
  - `ffmpeg -af volumedetect`: mean < −60dB = silent narration; max > −0.5dB = clipping
  - 4-frame extraction → vision judge spot-check (unreadable text, broken layout)
  - Hard rule: a failing review cannot be presented as success.

- [ ] **M4. Fix the font monoculture** (`src/remotion/fonts.ts`)
  4 of our 9 fonts are on the "instant AI tell" list — including the default
  (Inter) and display faces (Poppins, Playfair, Roboto). Add 2–3 non-monoculture
  faces loadable headless via `@remotion/google-fonts`; obey pairing guardrails:
  never two sans-serifs, cross serif+sans or sans+mono, weight gap ≥ 200.

## NEED — the biggest quality-per-effort wins after MUST

- [ ] **N1. Scene-intent schema + slideshow-risk gate** (spec.ts + new `src/lib/video/risk.ts`)
  Add per-scene: `shot_intent` (why this shot exists), `narrative_role`
  (hook | establish | build | payload | evidence | cta), `hero_moment: bool`.
  Then lift their scorer as ~100 lines of arithmetic (no LLM): flag >70% same
  scene type, >60% text-first scenes, scenes with no stated purpose, no hero
  moment. Verdict <2 strong / <3 acceptable / <4 revise / ≥4 block render.
  The gate is really the schema: purposeless scenes become *detectable*.

- [ ] **N2. Pacing + transition austerity constants** (SpecVideo + author prompt)
  - Tone→hold table: elegiac 4.0s (2.5–7.0) · reverent 3.5 · dreamlike 3.0 ·
    wry 2.0 · urgent 1.2s (0.5–2.5). Heroes hold longest; compress non-heroes first.
  - ≤ 4 transition types per video; one primary carries 60–70% of cuts.
    (Our fade/slide/wipe/clockWipe/flip free-for-all is "social-media edit slop".)
  - ≥ 3 distinct easings per composition; entrances `.out`, exits `.in`;
    velocity-matched cuts (exit power3.in meets entry power3.out at the cut).
  - One deliberate ~2s silence/music-drop at the emotional center — once only.
  - Music base volume ~0.1 under narration; fade-in 2s, fade-out 3s.

- [ ] **N3. Style playbooks — one preset end-to-end as proof** (new `src/lib/style/`)
  Slop = arbitrary finish. A preset locks: font pairing (with rationale),
  single-accent tint ladder (accent @ 4% card / 8% tint / 15% tint / 20% border;
  never pure #000/#fff — tint neutrals toward the accent), a composition rule,
  Remotion `springConfig` (motion personality is part of a look), and
  `anti_patterns` strings. Applies to images AND video via the same tokens.
  Brand stays sacred: preset decides treatment, never overrides brand colors/voice.
  Build ONE (non-default register), render the same copy through it, compare.
  Only then decide whether to systematize.

- [ ] **N4. Judge upgrades from their CHAI reviewer rules** (`vision-judge.ts` prompts)
  - Every critical finding must reference a concrete visible artifact and propose
    a fix expressible in our spec vocabulary; else it's "investigation", not critical.
  - Revision cap: max 2 rounds, then pass-with-warnings (kills infinite revise loops).
  - Anti-generic test verbatim: "Could this belong to any product after replacing
    the title? If yes → too generic." Feed the preset's anti_patterns to the judge.

## SHOULD — real wins, not blocking

- [ ] **S1. Background decor layer for images** (ImageComposition)
  2–5 always-on depth elements; the standout: ghost text — a giant theme word at
  3–8% opacity behind the hero. Directly fixes the dead-center void in
  type-as-image / big-type-small-caption. Add as decor roles (`ghost-word`,
  `radial-glow`, `grain`) — still zero coordinates.

- [ ] **S2. FLUX prompt engineering** (image provider + author prompt)
  - HF provider currently sends bare `{inputs: prompt}` — add
    `num_inference_steps: 4, guidance: 3.0`.
  - Prompt formula: subject → action → style → context → lighting → technical,
    natural prose not tag soup.
  - Hex + plain-English name pairs ("#7CFC5A (spring green)"), cap 3–5 colors,
    bind colors to named regions to stop bleeding.
  - Per-preset `image_prompt_prefix` + `negative_prompt` + consistency anchors
    owned by the style playbook, not the caller.

- [ ] **S3. Ken Burns alignment + text-over-video legibility** (SpecVideo)
  Their constants: scale 1.18–1.22 over the cut, ±25–40px diagonal drift, spring
  damping 18 / stiffness 80. Legibility over footage: brightness(0.55)
  saturate(0.85) on the clip + local gradient scrim + text-shadow — never just
  lower the video opacity.

- [ ] **S4. Caption discipline** (Captions.tsx)
  Vertical: 3–4 words/cue, ~20 chars/line; reading speed ~15 chars/sec;
  min display 0.5s, max 5s; cue end +200ms past the last word; karaoke
  active-word highlight as the baseline.

- [ ] **S5. AI-cliché blocklist in author prompts** (image + video catalog prompts)
  Never: gradient text · left-edge accent stripes on cards · cyan-on-dark /
  purple-blue gradients · pure #000/#fff · identical repeated card grids ·
  everything centered with equal weight · same transition on every cut.

- [ ] **S6. Cloudflare Workers AI image provider** (new provider)
  ~230 free FLUX-schnell images/day (10k neurons/day, no card), plus FLUX.2
  klein/dev for a quality bump. HF free tier is shrinking; Pollinations 401s in
  prod. Keep both as fallbacks behind Cloudflare.

## GOOD-TO-HAVE — when the above is proven

- [ ] **G1. Deterministic pre-judge gates for images**: WCAG contrast sampled under
  actual text boxes (alpha-aware), LayoutGAN-style overlap/alignment metrics —
  reject before spending judge calls. (Partly moot: our flow layout already makes
  overlap impossible.)
- [ ] **G2. Color-blind palette check**: hue-confusion ranges per CVD type; flag
  accent pairs that collide with lightness diff < 0.3.
- [ ] **G3. Deviation budget**: `max_deviation_ratio ≈ 0.2` — let 1 in 5 assets
  intentionally break the preset so batches don't go monotonous.
- [ ] **G4. Golden set**: keep (spec, render) pairs the judge scored highly; sample
  2–3 per generation as few-shot references, tagged by creative angle.
  Homogenization guard: rotate samples, never pin the same ones.
- [ ] **G5. Extraction timeout fix** (`claude-code.ts`): configurable timeout via
  env (extraction needs > 120s) and a real "timed out after Ns" error instead of
  bare exit 143. Latent prod bug — bites on every heavy brief.
- [ ] **G6. Curate mode — Pexels API**: free, 200 req/hr / 20k month, commercial-safe,
  no attribution; real photography often beats generated for marketing backgrounds.
- [ ] **G7. Provider scoring done honestly**: their 7-dim engine is a static table
  whose measurement hooks no code ever writes. If we ever score claude/codex/agy
  per task, feed it real pairwise-judge outcomes — we have the data they stubbed.
- [ ] **G8. Beat-grid sync (librosa audiomap)**: local beat/downbeat extraction for
  music-driven cuts. Only relevant once Buzz videos use real music beds.

## Explicitly NOT adopting

- **HyperFrames**: external HeyGen CLI, not vendorable source; Remotion covers it.
  Take the motion grammar (N2/S3), skip the engine.
- **Their 9-stage pipeline/checkpoint/backlot orchestration**: we're a Next.js app
  with a jobs table, not an agent factory.
- **Palette retrieval bank**: we're brand-driven; the client's colors beat a lookup
  table. The tint-ladder generator (N3) is the useful half.
- **Paid providers**: Kling / Runway / Veo / ElevenLabs — violates the constraint.
- **CLIP corpus retrieval / diarization / 2.5D parallax**: premature (and the depth
  tool doesn't even exist in their repo — their stills strategy is Ken Burns too).

## Sequencing

```
M1 → M2 → M3  (video correctness + eyes)      ~2 days
M4 + N3       (fonts + one preset proof)      ~1 day
N1 + N2       (intent schema + pacing)        ~1 day
N4 + S5       (judge + prompt upgrades)       ~half day
S1–S4, S6     as follow-ups
G*            on demand
```

Rationale: OpenMontage's whole quality layer presumes a renderer that can't emit
broken output. For video we don't have that yet — M1 first, always.
