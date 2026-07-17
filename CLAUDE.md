# CLAUDE.md

This file is read automatically at the start of every session in this repo.
It contains the full product spec, phased build plan, and operating rules —
there is no separate brief document, so treat this as the single source of
truth for context.

**Section 9 was reorganized** (previously a long chronological scroll) into
a categorized reference of current implementation state. Sections 0–8 are
the original spec, updated in place where the actual build has deviated
from it — each deviation is called out explicitly, not silently.

---

## 0. What this is

A mobile app (React Native + Expo) where a user photographs a clothing item
and gets outfit ideas: 3–4 outfit concepts, each shown as individual
clothing-item reference photos (not a single full-outfit photo) with a
short description. An onboarding swipe deck (shown on first launch) trains
a per-user preference vector — via CLIP embeddings, not a trained model —
so which outfit concepts get suggested gets more personal the more the
user uses the app. See section 1 for how "personal" is currently applied,
including where it's applied differently than originally planned.

No shopping/purchase links. This is a visual mood board and taste-learning
tool, not a shopping tool.

Timeline: ~10 weeks (June–August). Built phase by phase — see section 4.

---

## 1. How the preference-learning core actually works

No Teachable Machine, no separately trained model. CLIP embeddings are the
core mechanism, augmented by an LLM for the concept-generation step:

1. **Onboarding**: show a swipe deck of images (fixed/curated pool, not
   dynamically generated — narrowed to a session deck via an explicit
   style/age self-select step, see section 9). Each swipe (like/pass) gets
   CLIP-embedded.
2. **Preference vector**: average all "liked" embeddings into one vector per
   user — a running taste centroid — stored in Supabase. A weighted
   average, not a trained model. **Built and working.**
3. **Ongoing learning**: every like/pass on a generated recommendation
   should update that vector. **Not built** — there is no like/pass UI on
   recommendations and no `/api/recommendation-feedback` endpoint yet (see
   section 4's Phase 1 status). Currently the preference vector only grows
   from onboarding swipes.
4. **Applying it — amended from the original plan.** The original plan was
   to rank *candidate outfit-photo images* by cosine similarity to the
   preference vector. In practice, full-outfit reference photos (searched
   per concept) often didn't visually match the concept's actual listed
   items and looked poor as a UI. **Rebuilt**: `build-recommendations` now
   searches for an individual product/flat-lay photo per clothing item
   (e.g. "white jeans", "gold hoop earrings") and takes the first live
   result — **no CLIP ranking at this stage at all**. Personalization
   still happens, just one stage earlier: `generate-concepts` biases
   *which items get suggested in the first place* using a taste summary
   derived from the preference vector (nearest-neighbor tags — see
   section 9). Verified this actually changes output (section 9). The
   preference vector is therefore still load-bearing, just not applied the
   way this section originally described.

**Amendment (Phase 1 build):** onboarding also asks two explicit self-select
questions — preferred style archetype(s) and age range — immediately before
the swipe deck, to bias which images from the curated pool a given user
sees. This still respects the "fixed/curated set, not dynamically
generated" rule above: the underlying image pool itself is static (sourced
once, offline); only client-side filtering of that fixed pool is
personalized per user. Added because a single generic deck poorly serves a
broad user base; explicit self-select, rather than inferring from other
data, keeps with the same never-assume-about-the-user spirit as the rest
of this app.

Less infrastructure than Teachable Machine, not more — no training tool,
no exported model files, just embeddings already being generated plus one
row per user.

---

## 2. Tech stack

This table reflects what's **actually built**, not the original plan —
several rows changed mid-build for cost or availability reasons (each
change is a deliberate, discussed decision — see section 9 for the
reasoning behind each one, not a silent substitution).

| Layer | Choice | Notes |
|---|---|---|
| Mobile app | React Native + Expo, managed workflow | Dev via Expo Go on a physical device, no native build needed. **Expo SDK pinned to 54** — do not bump without checking Expo Go/App Store SDK support first (section 9). |
| Navigation | `expo-router` | File-based routing |
| Image capture | `expo-image-picker` | Camera + photo library |
| Swipe UI | `react-native-deck-swiper` | Used for onboarding. Has real gotchas — see section 9 before touching it. |
| Backend | Python + FastAPI | Not yet deployed anywhere — local dev only so far |
| Backend hosting | Render (free tier), when deployed | Not yet deployed. CPU-inference speed on this tier is an **open question** — see below |
| Item embeddings (CLIP) | **Self-hosted locally**, via `transformers` (`openai/clip-vit-base-patch32`), CPU | Changed from the original HF Inference API plan — HF's serverless tier no longer hosts any CLIP/image-embedding model at all (confirmed dead, section 9). Replicate was also considered and rejected (not actually free). Runs both in the one-time onboarding-pool precompute script and live in `/api/analyze-item`'s request path. **Render-deploy CPU speed is unverified** — everything so far has run on a dev laptop. |
| Item description + outfit concepts | **Gemini API** (`gemini-3.5-flash`), via the `google-genai` package | Changed from the original Claude/Sonnet plan — ruled out for cost (Gemini has a usable free tier; Claude and Replicate do not). This is the current provider for both `/api/analyze-item`'s description and `/api/generate-concepts`. **Claude is not used anywhere in the built code.** |
| Reference images | Google Images via SerpApi | Confirmed live, real field names (section 9). Searches per individual clothing item (product/flat-lay style), not per full outfit — see section 1 point 4. No ranking model involved — first live result wins. |
| Auth | **Not yet real.** Local-only anonymous user id (`AsyncStorage` + `expo-crypto` UUID) | Real Supabase anonymous sign-in (as originally planned for Phase 1) has not been built. This is a known gap — see section 4. |
| DB/storage | Supabase (Postgres + `pgvector`) | Two tables so far: `preference_vectors`, `analyzed_items` — see section 9 for schema. Both created by hand via the Supabase SQL editor; no migration tooling in this repo. |
| Deploy (dev) | None needed | Expo Go + a local FastAPI process (`--host 0.0.0.0` so a phone on the same LAN can reach it) covers all of development so far |

If a task seems to need a package or service not listed here, ask before
installing or introducing it. (This rule got exercised for real
mid-build — Replicate, Claude, and BLIP were all tried or discussed and
rejected in favor of what's in this table now. See section 9.)

---

## 3. Backend API contract

All five endpoints below are documented as actually implemented and
verified live, except `recommendation-feedback`, which does not exist yet.

```
POST /api/onboarding-deck
  → { deck: [{ image_id: string, image_url: string, tags: string[] }] }
  // Real. Backend holds a larger fixed pool (95 images spanning style +
  // age tags); the mobile app self-selects style/age first, then
  // client-side filters this response down to a ~16-card session deck.

POST /api/onboarding-swipe
  body: { user_id: string, image_id: string, liked: boolean }
  → { status: "ok" }
  // Real. Folds a liked image's precomputed CLIP embedding into a
  // running-average preference vector in Supabase. Passes are
  // acknowledged but don't touch the vector.

POST /api/analyze-item
  body: multipart/form-data, fields "image" and "user_id"
  → { item_description: string, embedding_id: string }
  // Real. item_description: Gemini API (gemini-3.5-flash), prompted to
  // describe only the garment (type/color/pattern/fit/visible
  // logos-text), not the person or scene. embedding_id: CLIP, self-hosted
  // locally, stored (with the description) in a new analyzed_items
  // Supabase row. embedding_id is currently write-only — nothing reads it
  // back yet.

POST /api/generate-concepts
  body: { item_description: string, user_id: string }
  → { concepts: [
        { vibe_label: string, items: string[], explanation: string }
      ] }
  // Real. Exactly 3-4 concepts (schema-enforced). Gemini API, same model
  // as analyze-item. "user's taste" bias: a nearest-neighbor-tags
  // heuristic over the onboarding pool's embeddings (not the literal
  // preference vector as text — see section 9), recomputed per call, not
  // stored. Falls back to no taste bias if the user has no
  // preference_vectors row yet (e.g. hasn't onboarded).

POST /api/build-recommendations
  body: { concepts: [{ vibe_label, items, explanation }], user_id: string }
  → { recommendations: [
        { vibe_label: string, explanation: string,
          images: [{ item: string, image_url: string, source: string }] }
      ] }
  // Real. Response shape differs from the original plan — each image now
  // carries an `item` field naming the specific clothing piece it shows
  // (e.g. "white jeans"), because images are per-item now, not per
  // full-outfit (section 1 point 4). Up to 4 items per concept get an
  // image (concepts can list up to 6; capped for card-size and latency
  // reasons). No CLIP ranking — first live SerpApi result per item wins.
  // user_id is accepted for contract-symmetry with the other endpoints
  // but currently unused (no ranking happens here to feed it into).

POST /api/recommendation-feedback   ← NOT BUILT
  body: { user_id: string, recommendation_id: string, liked: boolean }
  → { status: "ok" }
  // Same underlying update as onboarding-swipe would be. Blocked on
  // there being no like/pass UI on recommendations yet, and no
  // recommendation_id concept in the current build-recommendations
  // response (recommendations aren't persisted or ID'd right now).
```

---

## 4. Phased build plan

**Phase 1 — swipe onboarding + core recommendation loop (target: end of
June) — IN PROGRESS, not complete.** Status as of this update:

- ✅ Onboarding swipe deck (style/age self-select → curated pool → session
  deck), builds a real preference vector.
- ✅ Upload/take photo → CLIP embedding + Gemini description → Gemini
  generates 3-4 concepts (taste-biased) → per-item reference images shown
  per concept.
- ❌ **Anonymous auth on first launch** — still a local-only stand-in, not
  real Supabase anonymous auth (see section 2's Auth row).
- ❌ **Like/pass on each recommendation updates the preference vector** —
  not built at all. No like/pass UI, no `/api/recommendation-feedback`.
  This means the "ongoing learning" mechanism (section 1 point 3) doesn't
  exist yet — the preference vector currently only grows from onboarding.
- ⚠️ **Success criterion ("recommendations visibly weighted toward
  onboarding choices")** — partially true. Verified that *which items get
  suggested* is taste-biased (section 9's before/after example). *Which
  specific photo* represents each item is not taste-ranked (deliberately
  dropped, section 1 point 4) — this is a narrower personalization signal
  than originally specified, though the original signal (ranking
  full-outfit photos) is what got dropped for a good reason (looked worse,
  slower).

**What's left to close out Phase 1 properly:** the like/pass +
recommendation-feedback loop, and a decision on whether to build real
anonymous Supabase auth now or explicitly defer it into Phase 2's account
work. Neither has been discussed yet — ask before assuming either way.

**Phase 2 — user accounts + persistence + polish (target: mid-July)**
- Real signup/login (email/password, and/or social sign-in if time allows),
  replacing reliance on anonymous-only auth from Phase 1.
- Migrate the anonymous user's existing preference vector and history to
  their new account on signup — Supabase supports linking an anonymous
  session to a permanent account, so this shouldn't require rebuilding the
  vector from scratch. Confirm this linking flow works before considering
  the migration done, don't just assume it carries over. (Note: since real
  anonymous Supabase auth isn't built yet either — see Phase 1 status above
  — this phase may need to absorb that work too, not just the
  anonymous→permanent migration.)
- Store past recommendations + like history in Supabase, tied to the
  now-permanent user ID.
- Loading states, error states (no images found, CLIP/LLM failure, auth
  failures). Partial progress already exists here — see section 9's notes
  on 429/503 handling for the Gemini-calling endpoints.
- UI polish on swipe deck, recommendation cards, and the new login/signup
  screens — this is a portfolio piece.

**Phase 3 — preference tuning (target: late July)**
- Tune recency weighting in the preference vector.
- Consider a lightweight "why this was recommended" signal for
  transparency — `analyzed_items.embedding_id` (currently write-only, see
  section 3) may be relevant infrastructure for this.
- Possible revisit: bring CLIP-based ranking back into
  `build-recommendations` if per-item personalization turns out to matter
  more than expected once real usage data exists.

**Phase 4 — stretch: Pinterest import (Aug, optional)**
- Pinterest API v5 exists (`boards:read`/`pins:read` scopes) and is
  buildable, but only worth it if Phases 1–3 are solid with time to spare.
  Would seed the preference vector from an existing board instead of
  starting cold — a nice-to-have, not a differentiator, since in-app
  swipe/like data already does the core job.
- OAuth via `expo-auth-session` (not a plain web redirect — required for
  mobile OAuth to return to the app correctly).

**Phase 5 — buffer + demo prep (Aug)**
- Bug fixes, demo video, portfolio writeup.

**Cut order if the timeline gets tight:** Phase 4 → Phase 3 → Phase 2 →
UI polish. Phase 1 cannot be cut — it's the entire product.

---

## 5. Risks — status

- **Cold-start problem** (still open) — a small onboarding sample means
  recommendations right after onboarding may feel generic until real-use
  likes accumulate, and there's currently no post-onboarding feedback loop
  at all (Phase 1 gap above) to accumulate more.
- **Google Images API coverage/reliability/response fields** — ✅ resolved.
  Confirmed live against SerpApi; real field names documented in section 3.
- **HF Inference API** — ✅ resolved by moving off it entirely (section 2).
  Not "cold starts were slow," but "no longer hosts the model at all" —
  worth re-checking if a future session assumes HF is still viable for
  anything vision-related; their offerings change over time.
- **Render CPU inference speed** — **still open, now higher-stakes.** The
  original concern was about a hypothetical future deploy; CLIP and Gemini
  calls are now both live in real request paths (`analyze-item`), not just
  an offline script, and nothing has been deployed to Render yet to
  actually test this.
- **Anonymous auth persistence** — not yet applicable; real Supabase
  anonymous auth isn't built (Phase 1 gap above). The current local-id
  stand-in's persistence has been informally verified (survives app
  restarts, per section 9's dev-reset notes) but that's not the same
  guarantee.
- **Anonymous-to-permanent account migration (Phase 2)** — unchanged risk,
  still to be tested once Phase 2 auth work starts.
- **Expo Go limitations** — ✅ non-issue confirmed. `expo-image-picker` and
  `react-native-deck-swiper` both work fine in Expo Go; no ejecting needed.
- **New risk surfaced this build: third-party model/API availability drift.**
  Over the course of Phase 1 so far, three different provider assumptions
  went stale mid-build (HF's CLIP hosting, `gemini-2.0-flash`'s
  availability, Replicate's actual pricing). Don't trust a cached
  assumption about any external model/API's current state — verify live
  before building against it, same as the existing working rule #3 already
  says.

---

## 6. Mobile app screens

Actual screen structure differs from the original plan — screens 2–4 got
built as one combined screen rather than three separate ones, since the
underlying flow between them has no real navigation boundary (it's one
continuous async operation with three loading stages).

1. **Onboarding swipe screen** (`mobile/src/app/onboarding.tsx`) — first
   launch only. Three sub-steps: style-archetype self-select → age-range
   self-select → swipe deck.
2. **Upload screen** (`mobile/src/app/upload.tsx`) — **combines the
   original screens 2, 3, and 4.** Camera/library picker → three
   sequential loading stages (Identifying the piece → Generating outfit
   ideas → Finding references) → outfit concept cards, each with a
   swipeable image carousel (one item photo at a time, dot pagination,
   captioned with the item name) and an explanation. No like/pass — see
   section 4's Phase 1 gap. Ends with a "Done" link back to `/`.
   **This is a temporary combined-screen shape**, not a deliberate final
   design — revisit if/when a dedicated Recommendations screen with
   like/pass gets built.
3. *(Phase 2)* **Login/signup screens** — email/password (and/or social),
   with anonymous-to-permanent account linking on signup.
4. *(Phase 2)* **History screen** — past recommendations from Supabase.
5. *(Phase 4)* **Pinterest connect screen** — optional, off the main flow.

---

## 7. Repo structure

```
/mobile        Expo app (expo-router structure)
  /src/app       Screens (index, onboarding, upload) — file-based routing
  /src/services  api.ts (backend calls), anonymous-user.ts, onboarding-status.ts
  /src/data      style-buckets.ts, age-ranges.ts (onboarding self-select data)
/backend       FastAPI app
  main.py        App setup, CORS, router registration, /health
  /routes        onboarding.py, item.py, concepts.py, recommendations.py
  /services      One file per concern — CLIP, Gemini, SerpApi, Supabase,
                  preference-vector math, taste-summary derivation, plus a
                  few small shared-helper modules factored out along the
                  way (gemini_client.py, gemini_errors.py, embedding_utils.py)
  /scripts       fetch_onboarding_images.py (one-time, manually-run)
CLAUDE.md      This file
```

---

## 8. Working rules

1. **One phase at a time**, in the order in section 4. Don't start Phase 2
   while Phase 1 is unverified. (Phase 1 is currently unverified per
   section 4's status — the like/pass loop is missing.)
2. **Mock external APIs first, wire in real ones second.** For any phase
   touching CLIP, the LLM, or Google Images: build against mocked responses
   first, confirm the UI/data flow works, then swap in one real integration
   at a time — testing after each swap, not after all of them.
3. **Never assume a third-party API's response shape or a model's current
   availability.** Confirm against a live test call before building logic
   around it, and flag any mismatch with what's documented here. This bit
   for real multiple times in Phase 1 (see section 5's new risk entry) —
   take it seriously, not as boilerplate.
4. **Confirm before moving on** — actually run the Expo dev server / FastAPI
   server and verify a step works before considering it done.
5. **Secrets** go in environment variables / `.env`, never hardcoded, never
   printed to chat.
6. **Ask, don't guess** on anything ambiguous — a wrong assumption compounds
   across phases faster than a clarifying question would cost. This
   includes provider/cost tradeoffs, not just technical ambiguity — several
   mid-build pivots this phase (Claude→Gemini, Replicate→self-hosted,
   per-concept→per-item images) came from asking first rather than
   guessing what the user would prefer.

---

## 9. Current implementation state (reference, organized by topic)

Supplement to the spec above — sections 0–8 now reflect actual state
directly where they diverged; this section holds the supporting detail,
gotchas, and reasoning that's too granular for the main sections.

### Repo / environment

- **Repo**: `github.com/krisha06/styling-assistant`. Work happens on
  branch `1-core-application` for all of Phase 1.
- **Expo SDK pinned to 54, not the newest available.** The iOS App Store
  build of Expo Go is capped at SDK 54 as of this writing — installing the
  "latest" `expo` package will silently produce a project Expo Go rejects
  with a misleading "requires a newer version of Expo Go" error. The fix
  is downgrading the project, not updating Expo Go. **Do not bump `expo`
  without checking current Expo Go/App Store SDK support first.**
- **`mobile/AGENTS.md` conflict — still unresolved, still present.**
  Contains an instruction to read Expo v57 docs "before writing any code,"
  contradicting the SDK 54 pin above. Flagged to the user previously as a
  possible stale-file/prompt-injection situation; not modified or acted
  on. Re-flagging here since it hasn't been resolved across multiple
  sessions now — worth actually resolving (confirm intent or delete)
  before any future Expo-version-touching work.
- Key package versions: `expo ^54.0.0`, `react-native 0.81.5`,
  `expo-router ~6.0.24`, `expo-image-picker ~17.0.11`,
  `expo-crypto ~15.0.9`, `react-native-deck-swiper ^2.0.19`.
- Backend: Python 3.13, FastAPI, local `.venv` in `backend/`.
  `requirements.txt`: `fastapi`, `uvicorn[standard]`, `requests`,
  `python-dotenv`, `supabase`, `numpy`, `torch`, `transformers`, `Pillow`,
  `python-multipart`, `google-genai`. **No `anthropic`, no `replicate`** —
  both were added at points mid-build when those providers were being
  tried, then removed once the decisions landed elsewhere. If either
  reappears in `requirements.txt`, it's stray, not intentional.
- **Env vars** (`backend/.env`, gitignored — `.env.example` has the
  keys with empty values): `SERPAPI_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`. No Replicate or Anthropic
  key needed by anything currently built.
- Dev workflow: backend via `.venv/bin/uvicorn main:app --host 0.0.0.0
  --port 8000` (the `--host 0.0.0.0` matters — a bare `uvicorn main:app`
  only binds localhost and a phone on the same LAN can't reach it), mobile
  via `npx expo start` in a real terminal (not backgrounded — Expo's QR
  code only renders in an interactive TTY).

### Mobile — screens and gotchas

- Scaffolded via `create-expo-app`; default demo template removed in favor
  of a linear `Stack` layout (`src/app/_layout.tsx`) since the real flow
  isn't tabbed.
- **`react-native-deck-swiper` gotchas** (cost real debugging time —
  read before touching `onboarding.tsx` again):
  1. Sizes cards off `Dimensions.get('window')` (full device screen), not
     its parent container. Nesting it below a header in a normal flex
     column causes overflow. Fix: render any header as an
     absolutely-positioned overlay, let `<Swiper>` fill the entire screen,
     and feed it the header's measured height via `marginTop`.
  2. Its `shouldComponentUpdate` silently ignores changes to
     `marginTop`/`marginBottom`/`cardVerticalMargin` — recomputing those
     from a measured value won't visibly update unless you force a
     remount (`key={headerHeight}` on `<Swiper>`).
  3. `onSwipedAll`'s completion callback has a timing race at the last
     card — sometimes fires late or not at all. Workaround: detect the
     last card yourself (`cardIndex === deck.length - 1`) and finish
     immediately, keeping `onSwipedAll` only as a guarded fallback.
  Reference implementation for all three: `mobile/src/app/onboarding.tsx`.
  Apply the same patterns if this library is ever reused elsewhere.
- **Onboarding flow**: 3-stage local state machine
  (`select-style → select-age → swiping`) in `onboarding.tsx`.
  `style-buckets.ts` / `age-ranges.ts` hold the UI-facing self-select
  options. `buildSwipeDeck()` does client-side personalized filtering of
  the already-fetched pool (no new backend params) — matched-tag cards
  score highest, partial matches next, rest backfill for variety.
- **Anonymous user id**: `mobile/src/services/anonymous-user.ts`, a local
  `AsyncStorage`-persisted `anon-<uuid>` via `expo-crypto`'s
  `Crypto.randomUUID()` — **not** the bare `crypto.randomUUID()` global
  (this RN/Expo setup doesn't polyfill Web Crypto; the bare global throws
  at runtime). This is the stand-in referenced throughout as "not real
  Supabase anonymous auth."
- **Dev-only reset**: `index.tsx`'s `__DEV__`-only button resets both
  onboarding status *and* the anonymous user id together
  (`resetAnonymousUserId()` + `resetHasOnboarded()`) — resetting only the
  first one silently kept re-using the same Supabase preference-vector
  row across "resets" (found and fixed; not a live bug, but a real trap if
  the pattern is copied elsewhere).
- **Image load failures degrade gracefully**: hotlinked images (both the
  onboarding deck and per-item reference photos) can link-rot. Both
  `onboarding.tsx`'s `SwipeCard` and `upload.tsx`'s `ReferenceImage`
  handle `onError` on `expo-image` by swapping in a labeled "Image
  unavailable" placeholder instead of a blank/broken card.
- **`upload.tsx`** (the combined upload/loading/recommendations screen):
  - Three-stage async chain: `analyzeItem()` → `generateConcepts()` →
    `buildRecommendations()`, with `stage` state driving which loading
    message shows (`'analyzing' | 'generating-concepts' |
    'finding-references'`).
  - `services/api.ts`'s `analyzeItem()` was this file's first
    `FormData`/multipart call (everything before it was JSON) — sent
    **without** an explicit `Content-Type` header so RN sets the boundary
    itself.
  - **Error handling**: `RateLimitedError` (429) and `OverloadedError`
    (503) are thrown as distinct classes from a shared `throwForStatus()`
    helper in `api.ts`, so `upload.tsx` can show a message specific to
    each case rather than one generic failure string. See "Gemini
    reliability" below for the backend side of this.
  - **Image display went through two iterations.** First: a static
    wrapped grid of small (100×100) thumbnails with a 2-line-truncated
    item-name caption underneath — captions got visibly clipped at that
    size (user feedback, not caught in testing). **Rebuilt** as a
    swipeable `FlatList` carousel (`pagingEnabled`, one image at a time,
    full-width, un-clipped caption, dot-pagination row using the app's
    existing `backgroundElement`/`backgroundSelected` theme tokens rather
    than new hardcoded colors) — current shape, one carousel per concept
    card.

### Backend — endpoint-by-endpoint

**`/api/onboarding-deck` + `/api/onboarding-swipe`** (`routes/onboarding.py`)
— both real. Swipe folds a liked image's precomputed embedding into a
running-average `preference_vectors` row; passes are acknowledged but
don't touch it.

**Curated onboarding image pool** (`backend/scripts/fetch_onboarding_images.py`,
one-time manually-run script → `services/onboarding_deck.json`, currently
95 images): queries SerpApi once per tag (16 tags: 12 style archetypes +
4 age-range proxies), embeds each via local CLIP, writes the pool. Three
real quality problems were found and fixed while building this — all
still relevant if this script is ever re-run or adapted:
1. Plain `"<tag> outfit"` queries surfaced Pinterest collage graphics and
   magazine multi-celebrity grids. Fixed with a query suffix
   (`"street style photo -pinterest -collage -site:pinterest.com"`) plus
   Google's `tbs=itp:photo` filter.
2. `-site:pinterest.com` only excludes results whose *source page* is
   Pinterest — Pinterest's image CDN (`pinimg.com`) serves the same
   collage images via other source pages. Fixed by blocking the CDN host
   directly.
3. ~4% of live SerpApi URLs were dead on arrival (TikTok's internal image
   API returning 403 without a session; Facebook/Instagram SEO-crawler
   placeholder domains returning HTML, not an image). Fixed by
   live-validating every candidate URL (real GET + content-type check)
   before writing it to the pool, in addition to blocking known-bad
   domains outright.
Age tagging is a best-effort proxy via query phrasing only (e.g. "senior
style outfit over 60") — Google Images has no real demographic filter.
Known limitation, not a bug.

**`/api/analyze-item`** (`routes/item.py`) — real, two independent
sub-steps run sequentially (a discussed-but-not-yet-implemented speedup:
running them concurrently instead, since neither depends on the other's
output — see "Possible next optimization" below):
- **Description**: `services/image_caption.py`, Gemini API. Went through
  two provider changes before landing here — originally planned as a
  Claude vision call (section 2's old pin); ruled out for cost. Tried a
  local BLIP model (`Salesforce/blip-image-captioning-base`, same free
  self-hosted pattern as CLIP) — worked, but described the overall
  scene/person ("a man holding a white shirt") instead of the garment,
  missing detail like logos. Replaced with Gemini
  (`gemini-3.5-flash`), prompted explicitly for garment-only detail
  (type/color/pattern/fit/visible logos-text, not the person/background)
  — fixed the quality problem. Also confirmed live that
  `gemini-2.0-flash` (an earlier, more familiar model name) is no longer
  a listed/available model — `gemini-3.5-flash` is Google's current
  flash-tier model as of this build; re-verify if this drifts again.
- **Embedding**: `services/clip.py`'s `embed_image_bytes()`, factored out
  of the pool-precompute script's `embed_image_url()` so both share the
  same model-loading/processor logic — keeps live embeddings in the same
  vector space as the onboarding pool's precomputed ones. Considered
  Replicate as a hosted alternative to self-hosting; rejected once
  confirmed it isn't actually free.
- **Storage**: `services/analyzed_items.py` writes a row to a new
  `analyzed_items` Supabase table (schema below) — currently write-only,
  nothing reads `embedding_id` back.

**`/api/generate-concepts`** (`routes/concepts.py`) — real. Same Gemini
provider as analyze-item (asked and confirmed explicitly, not assumed,
given the just-made cost-driven swap on the sibling endpoint).
- **Structured output**: `services/concepts.py` uses
  `GenerateContentConfig(response_mime_type="application/json",
  response_schema=ConceptsResult)` (Pydantic models) rather than
  prompting for JSON and hand-parsing — confirmed the installed
  `google-genai` version supports this and returns a parsed instance on
  `response.parsed`. The 3–4 concept-count constraint is schema-enforced
  via `Field(min_length=3, max_length=4)`; verified live, never returned
  outside that range across multiple test calls.
- **Taste summary**: `services/taste_summary.py`. Section 3's contract
  calls for "a text summary of the user's taste" but a preference vector
  is just 512 numbers — resolved via a nearest-neighbor-tags heuristic:
  find the onboarding pool's 5 most similar images (cosine similarity) to
  the user's preference vector, summarize their most common style tags
  (age tags excluded — not style descriptors) as
  `"leans toward: <tag>, <tag>, <tag>"`. Recomputed fresh per call, not
  cached or stored. Returns `None` (no taste bias applied) if the user has
  no `preference_vectors` row yet. **Verified this actually biases
  output**: a user whose nearest-neighbor tags were `workwear, minimalist,
  quiet-luxury` got concepts literally labeled "Sophisticated Quiet
  Luxury" / "Modern Heritage Workwear" / "Refined Office Minimalist";
  the same item description with no taste vector produced a visibly
  different, unbiased set.

**`/api/build-recommendations`** (`routes/recommendations.py`) — real,
**rebuilt once already** after the first version's results looked poor:
- **v1 (superseded)**: one SerpApi search per *concept* (vibe_label +
  full item list), aiming for full-outfit street-style photos, with
  results ranked by CLIP cosine-similarity to the preference vector —
  i.e., exactly what section 1's original plan described. Worked
  end-to-end and was verified live, but the actual photos often didn't
  visually match the concept's specific listed items (a stock photo
  tagged "quiet luxury outfit" isn't guaranteed to contain cream wool
  trousers specifically) — user feedback after real device testing.
- **v2 (current)**: `services/reference_images.py` searches per
  *individual item* instead (product/flat-lay-style query — e.g. `"white
  jeans product photo -pinterest -collage -site:pinterest.com"`, same
  `tbs=itp:photo` filter and blocked-domain list as the onboarding
  script), capped at 4 items per concept. `services/recommendations.py`
  takes the **first live candidate** per item (`is_url_usable()` — a
  lightweight GET + content-type check, same pattern as the onboarding
  script's URL validation) — **no CLIP embedding or ranking in this
  endpoint at all now.** This was a deliberate, discussed tradeoff, not
  an oversight: per-item photo style doesn't vary meaningfully by taste
  the way full-outfit styling does, so the ranking cost (a CLIP forward
  pass per candidate) bought little, and dropping it meaningfully sped
  the endpoint up (roughly 18s for 4 items vs. ~37s for 3 concepts under
  the old ranked-outfit-photo approach, in informal timing). Response
  shape changed to match: `images: [{item, image_url, source}]`, not
  `[{image_url, source}]` — see section 3.
- Verified images are genuinely valid: spot-checked several real response
  URLs, confirmed real `image/*` content-type on GET (note: HEAD requests
  can report differently than GET for redirecting URLs — `requests.get()`
  with default redirect-following is what the backend actually uses and
  what should be used to verify, not a plain HEAD).

**Gemini reliability** (`services/gemini_client.py`,
`services/gemini_errors.py`) — shared across every Gemini call site:
- `generate_content_with_retry()`: a live call once returned `503
  UNAVAILABLE` ("model currently experiencing high demand... usually
  temporary"). Added a single automatic retry after a short delay on
  `ServerError` before giving up — resolves many cases silently.
- `raise_for_gemini_error()`: maps `ClientError` (429 → friendly
  rate-limit message) and `ServerError` (503, after the retry above
  already failed once → friendly "temporarily overloaded" message)
  to distinct `HTTPException`s; anything else falls through to a generic
  500. Shared by `routes/item.py` and `routes/concepts.py` (the two
  Gemini-calling routes) so the mapping doesn't drift per route.
- Mobile mirrors this with `RateLimitedError`/`OverloadedError` in
  `services/api.ts` (see mobile section above).

**Possible next optimization, discussed but not yet implemented:**
`analyze-item`'s two sub-steps (Gemini description call, local CLIP
embedding) currently run sequentially even though neither depends on the
other's output — running them concurrently (e.g. `asyncio.gather`, each
call in a thread since both are blocking) would cut total latency to
roughly `max(Gemini time, CLIP time)` instead of the sum. Flagged as the
highest-value, lowest-risk speedup available; not done yet, don't assume
it's already in place.

### Supabase schema

Both tables below use `pgvector`, are RLS-enabled with **zero policies**
(default-deny for the publishable/anon key; the backend's service-role
key bypasses RLS), and were created by hand via the Supabase SQL editor —
there's no migration tooling in this repo, so any future schema change
needs the same manual-SQL-editor step, or introducing real migrations
first.

- **`preference_vectors`**: `user_id text primary key`, `embedding
  vector(512)`, `like_count int`, `updated_at`. One row per user, updated
  in place as a running average (not one row per like).
- **`analyzed_items`**: `embedding_id uuid primary key default
  gen_random_uuid()`, `user_id text`, `embedding vector(512)`,
  `item_description text`, `created_at timestamptz default now()`. One
  row per `analyze-item` call (not a running average). Currently
  write-only — see `/api/analyze-item`'s notes above.

**Gotcha, confirmed live, applies to reading *either* table's `embedding`
column**: `supabase-py` returns pgvector columns as Postgres's **text
serialization** (`"[0.1,0.2,...]"`, a string), not a JSON array. Naively
`np.array(row["embedding"])` on the raw value silently produces a 0-d
string array, not a float array. Handled centrally by
`services/embedding_utils.py`'s `parse_pgvector()` (also home to
`cosine_similarity()`) — both `preference_vector.py` and
`taste_summary.py` import from there rather than re-implementing it.
