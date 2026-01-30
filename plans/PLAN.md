# Buzz Refined Development Plan

## Current State Summary

**Done:**
- Product CRUD + async AI extraction (profile, marketing strategy)
- Smart content rotation (hooks, pillars, pain/desire/objection)
- Instagram OAuth + publishing via Meta Graph API
- Text providers: Gemini (primary), HuggingFace (alternate)
- Image provider: Pollinations (framework ready, currently disabled)
- Vision-capable generation (Gemini sees screenshots)
- Admin auth (single password)

**Framework Ready, Not Enabled:**
- Image generation (`ENABLE_IMAGE_GENERATION = false` in code)
- Video/audio provider stubs exist

---

## Priority Tiers

### Tier 1: Complete Core Loop (High Impact, Low Effort)

#### 1.1 Enable Image Generation
Current: Flag disabled, Pollinations provider ready
- Flip `ENABLE_IMAGE_GENERATION = true`
- Test with real product
- Add image preview in ContentCard
- Handle generation failures gracefully

**Files:** `src/app/api/generate/route.ts`, `src/components/ContentCard.tsx`

#### 1.2 Scheduled Publishing
Current: DB has `scheduledAt` field, no scheduler
- Add scheduler service (node-cron or similar)
- Create `/api/scheduler/run` endpoint for cron trigger
- UI: date/time picker on approved posts
- Auto-transition scheduled→posted

**Files:** `src/lib/scheduler.ts`, `src/app/api/scheduler/route.ts`, content UI

#### 1.3 Token Refresh Flow
Current: 60-day tokens stored, no refresh
- Track token expiry in UI
- Add refresh button/auto-refresh before expiry
- Warn when tokens nearing expiration

**Files:** Instagram API routes, settings page

---

### Tier 2: Platform Expansion (Medium Effort)

#### 2.1 Twitter/X Integration
- OAuth 2.0 with PKCE
- Twitter API v2 for posting
- Platform-specific prompt rules
- Link Twitter account to product
- Support: text posts, image posts, threads

**New table:** `twitterAccounts`
**New routes:** `/api/twitter/*`

#### 2.2 Multi-Account Instagram
Current: One Instagram account per product
- Allow multiple IG accounts linked to one product
- Account selection at post time
- Bulk post to multiple accounts

---

### Tier 3: Analytics & Insights (Medium Effort)

#### 3.1 Content Performance Tracking
- Fetch engagement via Meta Graph API (likes, comments, reach)
- Store metrics per post
- Dashboard: top performing posts, engagement trends

**New table:** `postMetrics`
**New page:** `/analytics`

#### 3.2 A/B Insights
- Track which hooks/pillars/targets perform best
- Feed learnings back into rotation algorithm
- Suggest high-performers for new content

#### 3.3 Content Calendar View
- Calendar UI showing scheduled + posted content
- Drag-drop rescheduling
- Gap identification

---

### Tier 4: Video Generation (Higher Effort)

#### 4.1 Video Provider Integration
- Research: Runway ML, Pika, Luma Dream Machine
- Implement VideoProvider interface
- Generate reels/stories as video

**Files:** `src/lib/providers/video.ts`

#### 4.2 Audio/Voiceover
- Text-to-speech provider (ElevenLabs, etc.)
- Add voiceover to generated videos
- Music/background audio options

---

### Tier 5: Scale & Polish

#### 5.1 Bulk Operations
- Bulk approve/reject posts
- Bulk delete
- Bulk reschedule

#### 5.2 Content Templates
- Save successful content as templates
- Clone and modify templates
- Template library per product

#### 5.3 Export/Import
- Export content queue as CSV/JSON
- Import scheduled posts
- Backup/restore products

#### 5.4 Multi-User (Later)
- User accounts + roles (admin, editor, viewer)
- Team workspaces
- Activity log

---

## Recommended Execution Order

```
Phase 1 (Next Sprint)
├── 1.1 Enable Image Generation
├── 1.2 Scheduled Publishing
└── 1.3 Token Refresh

Phase 2
├── 3.3 Content Calendar
├── 2.2 Multi-Account Instagram
└── 5.1 Bulk Operations

Phase 3
├── 2.1 Twitter/X Integration
├── 3.1 Performance Tracking
└── 3.2 A/B Insights

Phase 4
├── 4.1 Video Provider
└── 4.2 Audio/Voiceover

Phase 5
├── 5.2 Content Templates
├── 5.3 Export/Import
└── 5.4 Multi-User
```

---

## Quick Wins (Can Do Anytime)

- [ ] Loading states for async operations
- [ ] Error toasts with actionable messages
- [ ] Keyboard shortcuts (n=new post, e=edit, etc.)
- [ ] Dark mode
- [ ] Mobile-responsive polish
- [ ] Rate limiting on generate endpoint

---

## Unresolved Questions

1. Video provider choice? — TBD, decision not yet taken
2. Scheduler approach (self-host vs external cron)? — decide when implementing
3. Image storage (local vs CDN)? — decide when scaling
4. Analytics polling frequency? — decide when implementing analytics
