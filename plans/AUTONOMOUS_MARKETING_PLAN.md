# Autonomous Marketing Plan (Path A)

> Source-of-truth for the multi-stage rebuild of Buzz from "AI content generator" into "autonomous marketing platform for software."
>
> Supersedes parts of [PLAN.md](./PLAN.md). The original `PLAN.md` stays for historical context but its priority tiers are obsolete.

## Goal

Make Buzz handle marketing for software over social media with minimal human intervention, where success = **real users using the marketed apps** (installs / signups / activations), not vanity metrics.

## Architecture (3 layers)

```
Layer 1: STRATEGY        who buy, why, where they hang, what message
Layer 2: PRODUCTION      make channel-native content
Layer 3: DISTRIBUTION    reach, engagement, attribution, learning
```

Buzz today only attempts layer 2. Skip 1 + 3 = posting-into-void forever (current state: ruh.journey IG, 42 posts, 1 follower).

## What Buzz already has (real foundation)

| Layer | Status | File |
|---|---|---|
| Product brain schema | Strong - ICP-ish via `ProductProfile.audience` + `customerSegments` + `differentiators` + `competitorContext` | `src/lib/brain/types.ts` |
| Strategy schema | Strong - categorized hooks, content pillars, pain/desire/objections, brand voice, CTA strategies | `src/lib/brain/types.ts` |
| Content rotation | Random-weighted picker over hooks/pillars/targets | `src/lib/brain/rotation.ts` |
| Provider abstraction | text/image/video/audio swappable | `src/lib/providers/` |
| Scheduler | Cron-style, per-product, per-platform field | `src/lib/scheduler.ts` |
| Publisher | IG Graph API working, Twitter referenced in enum but unbuilt | `src/lib/instagram.ts` |
| Revisions | Audit trail on profile/strategy changes | `productRevisions` table |
| Video pipeline | TTS + scenes + captions live (commit 326bd50) | `src/lib/video/` |
| Approval gate | Discord interaction routes hint at this | `src/app/api/discord/` |

## Gap to Path A

| Capability | Status | Severity |
|---|---|---|
| Strategist (channel/cadence/thesis decisions) | Missing - schedules built manually in UI | Critical |
| Multi-channel publishers (Reddit, X, HN, PH, dev.to, TikTok, SEO, ASO) | Only IG real | Critical |
| Attribution (short-links + install webhooks) | Zero | Critical - **blind without** |
| Platform metrics ingestion | Zero | Critical |
| Critic/learner (perf → rotation weights) | Rotation is random, no feedback loop | Critical |
| Campaign concept (goal + phase + hypothesis) | Schedules != campaigns | High |
| Launch sequencer (day-N playbook) | Missing | High |
| Audience research / ICP enrichment | Manual at product creation | Medium |
| Outbound engager (comments, replies) | Missing | Medium - high ban risk, build last |
| Approval policy (auto-approve high-trust templates) | Manual approval today | Medium |

## Target architecture

```
                        +------------------------------+
                        |  Product brain (EXISTING)    |
                        |  + ICP, JTBD, channelHints   |  [aug schema]
                        +--------------+---------------+
                                       |
                        +--------------v---------------+
                        |  Strategist agent  (NEW)     |
                        |  per-product weekly loop:    |
                        |   - reads perf, brain        |
                        |   - emits Campaign record    |
                        +--------------+---------------+
                                       |
                +----------------------+----------------------+
                v                      v                      v
        +--------------+       +--------------+       +--------------+
        |  Campaign    |       |  Rotation    |       |  Launch      |
        |  table (NEW) +------>|  EXISTING +  |       |  sequencer   |
        |              |       |  bandit weight|       |  (NEW)       |
        +------+-------+       +------+-------+       +------+-------+
               |                      |                       |
               +----------------------+-----------------------+
                                      v
                        +------------------------------+
                        |  Producer registry (NEW)     |
                        |   - existing IG producer     |
                        |   - reddit, X, HN, PH        |
                        |   - dev.to, SEO blog, ASO    |
                        |   - tiktok (later)           |
                        +--------------+---------------+
                                       |
                        +--------------v---------------+
                        |  Approval policy (NEW)       |
                        |  trust-scored, Discord gate  |
                        +--------------+---------------+
                                       |
                        +--------------v---------------+
                        |  Publisher registry (NEW)    |
                        |  per-channel post() + getMetrics()|
                        +--------------+---------------+
                                       |
                +----------------------+----------------------+
                v                      v                      v
        +--------------+       +--------------+       +--------------+
        | Short-link   |       |  Asset       |       |  Engager     |
        | + UTM (NEW)  |       |  post -> DB  |       |  (NEW, last) |
        +------+-------+       +--------------+       +--------------+
               |
               v
        +--------------+       +--------------+
        | Click+install|<------| Product app  |
        | webhook (NEW)|       | SDK/snippet  |
        +------+-------+       +--------------+
               |
               v
        +------------------------------+
        |  Metrics ingestor (NEW)      |
        |   - platform APIs            |
        |   - own click tracker        |
        |   - product webhook          |
        +--------------+---------------+
                       v
        +------------------------------+
        |  Critic/learner (NEW)        |
        |   - bandit per hook/pillar   |
        |   - per-channel CAC          |
        |   - feeds rotation weights   |
        +--------------+---------------+
                       |
                       +--> back to Strategist next cycle
```

## Stages

Detailed backlog lives in GitHub issues + milestones. Stage = milestone, ~6-week macro phases collapse to:

| Stage | Milestone | Issues | Weeks | Goal |
|---|---|---|---|---|
| 0 | Product brain augmentation | 3 (#22-24) | 0.5 | ICP/JTBD/channelHints schema + UI + LLM draft |
| 1 | Attribution + Critic on IG | 12 (#21, #25-35) | 3 | Close measurement loop on existing IG before scaling |
| 2 | Multi-channel + Strategist v1 | 10 (#36-45) | 4 | Reddit, X, SEO blog, ASO + cross-channel allocator |
| 3 | Launch motion + Approval policy | 6 (#46-51) | 2 | Day-N launch playbook + trust-scored auto-approve |
| 4 | TikTok/Reels + dev.to/IH | 7 (#52-58) | 3 | Higher-reach channels using video pipeline |
| 5 | Outbound engager | 6 (#59-64) | 2 | Subreddit/X watchers + value-add replies (highest ban risk - last) |
| 6 | Paid amplification | 4 (#65-68) | 2 | Meta/Google Ads + unified CAC |

**Critical path**: S0.1 -> S1.1 -> S1.2 -> S1.5 -> S1.7 -> S1.9. Everything else fans out from these.

Project board: https://github.com/users/lemmebee/projects/1/views/1

## Locked decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Short-link domain | Deferred. Buzz local until proven worthy. Build against `localhost:3000/s/...`; env var `BUZZ_PUBLIC_URL` swap-able later |
| Q2 | Install attribution | JS snippet on ruhjourney.com. Events: `visit`, `signup`, `activate`. HMAC SHA-256 + timestamp + nonce. App Store / Play install referrer deferred to Stage 2 ASO |
| Q3 | LLM budget | **Free tier only. No paid LLM.** Per-product cap 50 LLM calls/day. Fallback chain: gemini-2.0-flash -> gemini-1.5-flash -> huggingface |
| Q4 | Approval gate | Discord-only for v1 (existing plumbing). In-app queue only if >20 pending at any time |
| Q5 | Hosting | Local until Buzz proves worthy. CodeRabbit + CI run on GitHub regardless |
| Q6 | First test product | **Ruh** (ruhjourney.com). Web signup + 445 visits / 722 PV last 30 days = real attribution target |
| Q7 | Repo public/private | **Public** (flipped from private after CodeRabbit pricing showed $30/seat/mo for private). Buzz core open-source. When Stage 5 (engager) lands, split into separate private repo OR ship as opt-in module. Free CodeRabbit Pro + free branch protection are the prize |

## Channel selection logic (Strategist must implement)

Strategist picks channel per product from product profile, not by default. Hardcoding is forbidden.

- Quran app (Ruh): TikTok + r/islam + r/Muslim probable; IG with 0 followers unlikely
- Dev tool: X + r/programming + HN + dev.to
- Visual consumer app: IG + TikTok
- B2B SaaS: SEO blog + LinkedIn + cold email

Build modules in order of **capability coverage**, not channel preference:
- Channels where attribution actually work (deep link / referrer trackable)
- Channels with lowest automation-ban risk (so v1 doesn't die week 2)
- Channels that cover broadest ICP variety across future products

Early modules: Reddit, X, SEO blog, ASO. Late modules: TikTok, IG Reels, comment engagers, paid ads.

## Risks (explicit)

| Risk | Mitigation |
|---|---|
| Platform ToS / bans | Per-channel post:engage:lurk ratio policy. Engager last. Rate-limit aggressive. Safety dashboard (S5.6) |
| LLM cost runaway | Free tier only; 50/day/product cap; fallback chain |
| Attribution dark patterns | Per-channel attribution mode in registry; some platforms strip links - branch on attributionMode |
| Discord gate scaling | Trust auto-approval threshold tunes itself (S3.4 + S3.6) - not static |
| Single-product test (Ruh) | One product = one data point. Validate architecture but expect channel mix to shift for next products |
| Buzz instance offline | Stage 1-3 = local-only. Cron + webhook reliability constrained to user's machine uptime. Move to Railway/Fly at Stage 4+ |
| Free-tier rate limits | Project-wide Gemini RPD ceiling (1500/day) caps fleet of products to ~10 actively-served |
| Engager code public | Stage 5 engager must split to private repo OR opt-in plugin BEFORE merging to public Buzz |

## What human must still do (be honest about "minimal")

| Task | Auto | Human |
|---|---|---|
| Fill ICP/JTBD per product (once) | LLM draft (S0.3) | Refine (~30min one-time) |
| Hand over platform tokens | n/a | One-time per channel |
| Strategist weekly decisions | yes | Review week 1-4, then yes |
| Content gen | yes | n/a |
| Approval | trust-gated auto | Low-trust queued to Discord |
| Posting | yes | n/a |
| Metrics ingest | yes | n/a |
| Critic | yes | n/a |
| Kill bad campaign | auto if CAC > N or trust drops | Manual override |
| Real DMs from interested humans | draft only | Send |
| Pay for ads | n/a | Yes (Stage 6 only) |

Realistic steady-state: **30 min/wk after Stage 3**, plus 1 hr per new product onboarded.

## Open items (not blocking, decide later)

- Per-product custom domain for short-links (white-label phase)
- Multi-tenant Buzz (Buzz as a service, not just personal tool) - out of scope until ROI proven
- Switch SQLite -> Postgres for prod multi-tenant - track as separate epic
- Paid LLM budget unlock criteria - revisit after Stage 1 results
