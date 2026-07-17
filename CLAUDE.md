# CLAUDE.md

This file is read automatically at the start of every session in this repo.
It contains the full product spec, phased build plan, and operating rules —
there is no separate brief document, so treat this as the single source of
truth for context.

---

## 0. What this is

A mobile app (React Native + Expo) where a user photographs a clothing item
and gets 3–4 full outfit recommendations, each with images and a short
description. The user likes/passes each recommendation. An onboarding swipe
deck (shown on first launch) plus ongoing like/pass feedback trains a
per-user preference vector — via CLIP embeddings, not a trained model — so
recommendations get more personal the more the user uses the app.

No shopping/purchase links. This is a visual mood board and taste-learning
tool, not a shopping tool.

Timeline: ~10 weeks (June–August). Built phase by phase — see section 4.

---

## 1. How the preference-learning core actually works

No Teachable Machine, no separately trained model. CLIP embeddings (already
needed elsewhere in the pipeline) are the whole mechanism:

1. **Onboarding**: show a swipe deck of ~15–20 outfit images (fixed/curated
   set for Phase 1, not dynamically generated). Each swipe (like/pass) gets
   CLIP-embedded.
2. **Preference vector**: average all "liked" embeddings into one vector per
   user — a running taste centroid — stored in Supabase. A weighted
   average, not a trained model.
3. **Ongoing learning**: every like/pass on a generated recommendation
   updates that vector. Optionally weight recent likes slightly more than
   old ones.
4. **Applying it**: when ranking candidate images for a new upload, score
   each by cosine similarity to the user's preference vector and prefer
   closer matches.

**Amendment (Phase 1 build, see section 9 for full detail):** onboarding
now also asks two explicit self-select questions — preferred style
archetype(s) and age range — immediately before the swipe deck, to bias
which images from the curated pool a given user sees. This still respects
the "fixed/curated set, not dynamically generated" rule above: the
underlying image pool itself is static (sourced once, offline); only
client-side filtering of that fixed pool is personalized per user. Added
because a single generic deck poorly serves a broad user base (e.g. a
20-year-old and a 60-year-old shouldn't see the same deck); explicit
self-select, rather than inferring from other data, keeps with the same
never-assume-about-the-user spirit as the rest of this app.

Standard content-based recommendation pattern. Less infrastructure than
Teachable Machine, not more — no training tool, no exported model files,
just embeddings already being generated plus one row per user.

---

## 2. Tech stack (do not substitute without asking)

| Layer | Choice | Notes |
|---|---|---|
| Mobile app | React Native + Expo, managed workflow | Dev via Expo Go on a physical device, no native build needed |
| Navigation | `expo-router` | File-based routing |
| Image capture | `expo-image-picker` | Camera + photo library |
| Swipe UI | `react-native-deck-swiper` or custom `PanResponder` | Used for both onboarding and recommendation like/pass |
| Backend | Python + FastAPI | |
| Backend hosting | Render (free tier) | Cold-start latency expected on free tier |
| Embeddings | CLIP via Hugging Face Inference API | Not self-hosted — CPU inference on Render free tier is too slow |
| Outfit concepts | Claude API (Sonnet) | Generates the 3–4 outfit concepts + descriptions |
| Visual references | Google Images API (via SerpApi or similar) | Image + source only — no price/brand/buy-link fields |
| Auth | Supabase Auth — anonymous sign-in for Phase 1, real email/password (and/or social) signup added in Phase 2 | Anonymous session must be linkable to a permanent account on signup so preference data isn't lost |
| DB/storage | Supabase (Postgres + Storage) | Preference vector as a float array or pgvector column |
| Deploy (dev) | None needed | Expo Go covers all of development |

If a task seems to need a package or service not listed here, ask before
installing or introducing it.

---

## 3. Backend API contract (Phase 1)

```
POST /api/onboarding-deck
  → { deck: [{ image_id: string, image_url: string, tags: string[] }] }
  // Real, implemented — see section 9. Backend holds a larger fixed pool
  // (~90+ images spanning style + age tags); the mobile app self-selects
  // style/age first, then client-side filters this response down to a
  // ~16-card session deck. Not a request param on this endpoint.

POST /api/onboarding-swipe
  body: { user_id: string, image_id: string, liked: boolean }
  → { status: "ok" }
  // Embeds the image (or uses a precomputed embedding) and folds it into
  // the user's preference vector.
  // STUBBED as of section 9's latest update — validates + logs only, no
  // real CLIP call or vector math yet.

POST /api/analyze-item
  body: multipart/form-data, field "image"
  → { item_description: string, embedding_id: string }

POST /api/generate-concepts
  body: { item_description: string, user_id: string }
  → { concepts: [
        { vibe_label: string, items: string[], explanation: string }
      ] }   // 3-4 concepts; LLM prompted with a text summary of the user's taste

POST /api/build-recommendations
  body: { concepts: [...], user_id: string }
  → { recommendations: [
        { vibe_label: string, explanation: string,
          images: [{ image_url, source }] }   // ranked by similarity to preference vector
      ] }

POST /api/recommendation-feedback
  body: { user_id: string, recommendation_id: string, liked: boolean }
  → { status: "ok" }
  // Same underlying update as onboarding-swipe.
```

Field names for the Google Images provider (`image_url`, `source`, etc.) are
best guesses — confirm against a live test call before building ranking
logic around them, and flag if the real response differs from this.
**Partially confirmed** (section 9): the onboarding-deck curation script
confirmed SerpApi's real `google_images` field names —
`images_results[].original` for the direct image URL, `.link` for the
source page — but `/api/build-recommendations`'s own use of this provider
is still unverified live.

---

## 4. Phased build plan

**Phase 1 — swipe onboarding + core recommendation loop (target: end of June)**
- Anonymous auth on first launch.
- Onboarding swipe deck: a fixed, curated pool of images (auto-sourced once
  via SerpApi, not hand-picked or dynamically queried per session — see
  section 9), narrowed to a ~16-card session deck via an explicit
  style-archetype + age-range self-select step before swiping. Builds
  initial preference vector.
- Upload/take photo → CLIP embedding → LLM generates 3–4 concepts → Google
  Images pulls reference images per concept, ranked by similarity to the
  user's preference vector → recommendations shown with image + description.
- Like/pass on each recommendation updates the preference vector.
- Success criterion: after onboarding, a real clothing photo returns
  recommendations visibly weighted toward onboarding choices (not random).

**Phase 2 — user accounts + persistence + polish (target: mid-July)**
- Real signup/login (email/password, and/or social sign-in if time allows),
  replacing reliance on anonymous-only auth from Phase 1.
- Migrate the anonymous user's existing preference vector and history to
  their new account on signup — Supabase supports linking an anonymous
  session to a permanent account, so this shouldn't require rebuilding the
  vector from scratch. Confirm this linking flow works before considering
  the migration done, don't just assume it carries over.
- Store past recommendations + like history in Supabase, tied to the
  now-permanent user ID.
- Loading states, error states (no images found, CLIP/LLM failure, auth
  failures).
- UI polish on swipe deck, recommendation cards, and the new login/signup
  screens — this is a portfolio piece.

**Phase 3 — preference tuning (target: late July)**
- Tune recency weighting in the preference vector.
- Consider a lightweight "why this was recommended" signal for transparency.

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

## 5. Risks to validate early, not late

- **Cold-start problem**: 15–20 onboarding swipes is a small sample —
  recommendations right after onboarding may feel generic until real-use
  likes accumulate. Test on yourself early.
- **Google Images API coverage/reliability/response fields** — verify
  against the actual provider before building ranking logic around it.
- **HF Inference API cold starts** — first call to a model can be slow.
- **Anonymous auth persistence** — confirm the Supabase anonymous session
  survives app restarts on a real device before relying on it.
- **Anonymous-to-permanent account migration (Phase 2)** — test that
  signing up actually carries over the existing preference vector and
  history rather than starting a fresh empty account under the hood; this
  is an easy thing to silently get wrong.
- **Expo Go limitations** — `expo-image-picker` and swipe gesture libraries
  all work fine in Expo Go; no ejecting needed for this project.

---

## 6. Mobile app screens

1. **Onboarding swipe screen** — first launch only. Actually three
   sub-steps: style-archetype self-select → age-range self-select → swipe
   deck (see section 9).
2. **Upload screen** — camera/library picker, single CTA.
3. **Loading screen** — three-stage progress (Identifying the piece →
   Generating outfit ideas → Finding references).
4. **Recommendations screen** — image + description cards, like/pass on each.
5. *(Phase 2)* **Login/signup screens** — email/password (and/or social),
   with anonymous-to-permanent account linking on signup.
6. *(Phase 2)* **History screen** — past recommendations from Supabase.
7. *(Phase 4)* **Pinterest connect screen** — optional, off the main flow.

---

## 7. Repo structure (proposed — adjust if there's a reason to)

```
/mobile        Expo app (expo-router structure)
/backend       FastAPI app
  /routes      One file per endpoint group
  /services    CLIP, LLM, Google Images, preference-vector logic
CLAUDE.md      This file
```

---

## 8. Working rules

1. **One phase at a time**, in the order in section 4. Don't start Phase 2
   while Phase 1 is unverified.
2. **Mock external APIs first, wire in real ones second.** For any phase
   touching CLIP, the LLM, or Google Images: build against mocked responses
   first, confirm the UI/data flow works, then swap in one real integration
   at a time — testing after each swap, not after all of them.
3. **Never assume a third-party API's response shape.** Confirm against a
   live test call before building logic around it, and flag any mismatch
   with what's documented here.
4. **Confirm before moving on** — actually run the Expo dev server / FastAPI
   server and verify a step works before considering it done.
5. **Secrets** go in environment variables / `.env`, never hardcoded, never
   printed to chat.
6. **Ask, don't guess** on anything ambiguous — a wrong assumption compounds
   across phases faster than a clarifying question would cost.

---

## 9. Current implementation state (living section — update as work progresses)

This section tracks decisions and progress made during actual implementation,
as a supplement to the spec above. Sections 0–8 are the original plan and
should stay as the source of truth for intent; this section is where we
record what's actually been built and any environment-specific gotchas
discovered along the way.

**Repo**: `github.com/krisha06/styling-assistant`. Work happens on branch
`1-core-application` for all of Phase 1.

**Expo SDK is pinned to 54, not the newest available.** As of mid-2026, the
iOS App Store build of Expo Go is capped at SDK 54 — SDK 55+ has been stuck
in Apple App Store review with no ETA (see Expo's own changelog:
expo.dev/changelog/expo-go-and-app-store-may-2026). Installing the "latest"
`expo` package (57 at time of writing) will silently produce a project that
Expo Go on a physical iOS device rejects with "Project is incompatible with
this version of Expo Go" / "requires a newer version of Expo Go" — that
error is misleading; the fix is to *downgrade* the project to match Expo
Go's actual App Store SDK cap, not to update Expo Go (it's already current).
**Do not bump the `expo` package version without checking current Expo
Go/App Store SDK support first.**

- Swipe UI decision from section 2's either/or: **`react-native-deck-swiper`**
  (over custom `PanResponder`) — used for onboarding, and will be reused for
  recommendation like/pass.
- Mobile app scaffolded via `create-expo-app` (expo-router, TypeScript). The
  default demo template (tab bar, `explore.tsx`, `app-tabs.tsx` and the
  components only they used) has been removed and replaced with a `Stack`
  layout in `src/app/_layout.tsx`, since the real app flow is linear
  (onboarding → upload → loading → recommendations), not tabbed.
- Onboarding swipe screen built at `mobile/src/app/onboarding.tsx`, gated by
  a local AsyncStorage flag (`mobile/src/services/onboarding-status.ts`) so
  it only shows once — this is a local-only stand-in until Phase 2 auth
  exists; it is not the permanent mechanism described in section 4.
- Per working rule #2, onboarding is currently wired against a **mock**
  API layer (`mobile/src/services/api.ts` + `mobile/src/data/onboarding-deck.ts`)
  standing in for `POST /api/onboarding-deck` and `POST /api/onboarding-swipe`
  from section 3, using placeholder (picsum) images. No backend exists yet.
  Images are intentionally left as placeholders for now — swap for a real
  curated outfit-photo set once the backend/onboarding-deck endpoint exists,
  rather than doing the swap twice.
- `/backend` FastAPI skeleton has not been started yet. **This is the next
  task** (mocked endpoints first, per working rule #2 and the Half A/Half B
  build order agreed on for Phase 1).

**`react-native-deck-swiper` gotcha (cost real debugging time — read before
touching `onboarding.tsx` again):**
- The library sizes cards off `Dimensions.get('window')` (the full device
  screen height), not off its actual parent container's measured size. If
  you nest it below a header inside a normal flex column, the cards will
  always be too tall and overflow past the bottom of the screen — the
  `marginTop`/`marginBottom`/`cardVerticalMargin` props are the only way to
  compensate, and they only work correctly if the `<Swiper>` itself fills
  the *entire* screen (i.e. render any header as an absolutely-positioned
  overlay on top of it, not as a flex sibling that eats real layout space).
- Its `shouldComponentUpdate` is hardcoded to only check the `cards` and
  `cardIndex` props (plus a few internal state fields) — it **silently
  ignores** changes to `marginTop`/`marginBottom`/`cardVerticalMargin`, so
  recomputing those from a measured value (e.g. header height via
  `onLayout`) won't actually update the rendered card size unless you force
  a remount, e.g. `key={headerHeight}` on the `<Swiper>`.
- Current working implementation of both fixes lives in
  `mobile/src/app/onboarding.tsx` — treat that file as the reference pattern
  if `react-native-deck-swiper` is reused for the recommendation
  like/pass screen later (section 6, screen 4).

All of the onboarding screen work, the SDK 54 downgrade, and the
`app.json`/`use-theme.ts`/`animated-icon.tsx` fixes described above are
committed (`b626fd5`, "Build onboarding swipe screen; downgrade to Expo
SDK 54") and pushed to `origin/1-core-application`.

---

**`/backend` now exists** (the line above said "this is the next task" as of
the last update — this block covers that work). Minimal FastAPI app:
`main.py` (app + dev CORS + `/health`), `routes/onboarding.py`,
`services/onboarding_deck.py`. Only the onboarding endpoints are built —
`/api/analyze-item`, `/api/generate-concepts`, and
`/api/build-recommendations` from section 3 are still unbuilt, deliberately
out of scope for this pass.

- `POST /api/onboarding-deck` is real — serves the curated pool from
  `services/onboarding_deck.json`.
- `POST /api/onboarding-swipe` is still a **stub** — validates the payload
  and logs, but does not call CLIP or touch a preference vector (no
  Supabase yet either). Marked with a `TODO(real-CLIP-integration)` comment
  in `routes/onboarding.py`, grep-able when that work starts.

**Curated onboarding image pool — sourced automatically, not hand-picked.**
Rather than hand-curating ~15-20 photos (impractical to do well across
demographics), `backend/scripts/fetch_onboarding_images.py` is a one-time,
manually-run script that queries SerpApi's Google Images engine once per
tag and writes the results to `services/onboarding_deck.json`. Re-run any
time to refresh the pool — it fully re-fetches everything, not
incrementally, so each run costs one SerpApi search per tag against your
account's quota.

- 16 tags total: 12 style archetypes (`classic-timeless`, `quiet-luxury`,
  `preppy`, `workwear`, `cozy-casual`, `minimalist`, `athleisure`,
  `streetwear`, `colorful-maximalist`, `eclectic-vintage`, `romantic`,
  `boho`) + 4 age ranges (`under-25`, `25-40`, `40-60`, `60-plus`) — the
  latter tagged separately from style, not crossed with it. Current pool:
  94 images (~6 per tag).
- Age tagging is a **best-effort proxy via search-query phrasing only**
  (e.g. "senior style outfit over 60") — Google Images has no real
  demographic filter, so results aren't guaranteed to actually depict
  someone in that age range. Known limitation, not a bug — revisit if a
  better source/method comes up later; the script is fully decoupled from
  the rest of the app, so swapping it out only touches this one file.
- **Resolves section 3's "best guess" flag on SerpApi's response shape**:
  confirmed live — results are under `images_results`, each item's direct
  image URL is `.original` (not `.image_url`), source page is `.link`.
- Three real quality problems surfaced and fixed while building this — read
  before re-running or modifying the script:
  1. Plain `"<tag> outfit"` queries returned a lot of unusable results:
     Pinterest "collage card" graphics (dozens of cut-out people composited
     onto a flat background with a big caption) and magazine multi-celebrity
     cutout grids, not real single-shot photos. Fixed by appending
     `"street style photo -pinterest -collage -site:pinterest.com"` to every
     query plus Google's `tbs=itp:photo` filter.
  2. `-site:pinterest.com` only excludes results whose *source page* is
     pinterest.com — it does **not** block images served from Pinterest's
     image CDN (`pinimg.com`) via other source pages, so collage-style
     images were still slipping through. Fixed by blocking the `pinimg.com`
     host directly (`BLOCKED_URL_SUBSTRINGS` in the script).
  3. ~4% of URLs from a live SerpApi response were actually dead on
     arrival — TikTok's internal image API (`tiktok.com/api/img`, 403
     without a session) and Facebook/Instagram's SEO-crawler placeholder
     domains (`lookaside.instagram.com`, `lookaside.fbsbx.com`, return HTML
     not an image) — these render as a blank/black swipe card in the app.
     Fixed by live-validating every candidate URL (real HTTP GET +
     content-type check) before writing it to the deck, in addition to
     blocking the known-bad domains outright.

**Onboarding flow now has a self-select pre-filter, not just a swipe deck**
(amends section 1 point 1 and section 6 screen 1 — see the amendment notes
there). `mobile/src/app/onboarding.tsx` is now a 3-stage local state
machine: `select-style` → `select-age` → `swiping`.

- `mobile/src/data/style-buckets.ts`: 4 UI-facing buckets (Classic &
  Polished, Casual & Cozy, Bold & Street, Romantic & Boho) each mapping to
  2-4 of the fine-grained style tags above, plus a "Not sure — show me a
  mix" skip. User picks up to 2 buckets.
- `mobile/src/data/age-ranges.ts`: the 4 age tags above as UI labels, plus a
  "Prefer not to say" skip.
- `buildSwipeDeck()` in `onboarding.tsx` does the actual personalization —
  pure client-side filtering of the already-fetched pool, no new backend
  endpoint or params: cards matching both the selected style tags and the
  selected age tag score highest, cards matching just one score next, the
  rest backfill up to a ~16-card session deck for variety. Never a fully
  monotonous deck even with a narrow bucket+age combo.
- This deliberately stops short of a fancier version discussed and rejected
  for now (live per-session dynamic image fetching, two-round
  CLIP-centroid + pgvector refinement) — that needs real CLIP and Supabase
  wired in first, neither of which exists yet. Revisit as a Phase 3-style
  enhancement once the Phase 1 core loop (real CLIP embedding + preference
  vector) is actually built.

**Mock API layer fully replaced with real backend calls.**
`mobile/src/data/onboarding-deck.ts` (the picsum-placeholder mock) is
deleted. `mobile/src/services/api.ts` now makes real `fetch` calls to
`/api/onboarding-deck` and `/api/onboarding-swipe`, with the backend base
URL auto-detected from `Constants.expoConfig.hostUri` (the same LAN host
Expo Go already resolves to load the JS bundle), overridable via
`EXPO_PUBLIC_API_BASE_URL`. New `mobile/src/services/anonymous-user.ts`
generates and persists a local random user id (AsyncStorage) — a temporary
stand-in for the `user_id` the swipe contract needs, since Phase 1
anonymous Supabase auth isn't built yet. Uses `expo-crypto`'s
`Crypto.randomUUID()`, **not** the bare `crypto.randomUUID()` global —
verified this RN 0.81.5/Expo setup doesn't polyfill Web Crypto, so the bare
global throws at runtime.

**Dev-only onboarding reset.** `mobile/src/app/index.tsx`'s placeholder
home screen has a `__DEV__`-only "[dev] Reset onboarding" link (calls the
new `resetHasOnboarded()` in `onboarding-status.ts`) so onboarding can be
re-tested without reinstalling the app. Won't ship to production builds.

**Second `react-native-deck-swiper` gotcha** (in addition to the
sizing/remount one above): its `onSwipedAll` completion callback has a
timing race right at the last card — sometimes fires late or not at all,
leaving an empty stack visible instead of navigating away. Worked around in
`onboarding.tsx`'s `handleSwipe` by detecting the last card ourselves
(`cardIndex === deck.length - 1`) and finishing immediately, with
`onSwipedAll` kept only as a guarded fallback (a `finished` ref prevents
double-firing). Apply the same pattern if this library is reused for the
recommendation like/pass screen (section 6, screen 4).

**Image load failures now degrade gracefully.** Since onboarding images are
hotlinked from arbitrary external sites, some link rot over time is
inevitable even with the validation above. `onboarding.tsx` now has a
`SwipeCard` component with an `onError` handler on the `expo-image` — a
failed load shows a labeled "Image unavailable" placeholder instead of a
blank card.

---

**`POST /api/onboarding-swipe` is now real** (was previously the last
documented stub in section 3/9). Implements CLAUDE.md section 1 steps 1-3:
liked swipes are folded into a running-average preference vector per user,
stored in Supabase; passes are acknowledged but never touch the vector.

- **Stack deviation from section 2, done with explicit sign-off (not a
  silent substitution):** section 2 pins "CLIP via Hugging Face Inference
  API," but as of this work, HF's serverless Inference API **no longer
  hosts any CLIP or image-embedding model at all** — confirmed live via
  `curl https://huggingface.co/api/models/openai/clip-vit-base-patch32?expand=inferenceProviderMapping`,
  which returns an empty `inferenceProviderMapping` (checked several other
  CLIP/image-embedding checkpoints too — same result). The
  `api-inference.huggingface.co` domain used by the old REST pattern no
  longer even resolves; HF's `docs/inference-providers/providers/hf-inference`
  page confirms the free serverless tier now covers only text
  tasks (embedding/classification/small LLMs), not vision models.
  Re-check this before assuming it's fixed — HF's Inference Providers
  lineup changes over time.
- **Resolution taken:** since the 94 curated onboarding images are a fixed,
  precomputed pool (not a live per-request need), CLIP now runs **locally**
  via `transformers` (`openai/clip-vit-base-patch32`, CPU) — but **only**
  inside `backend/scripts/fetch_onboarding_images.py`, a manual, one-time,
  developer-machine script. This never runs on Render and never sits in a
  live request path, so it doesn't reintroduce the "CPU inference on Render
  free tier is too slow" problem section 2 originally flagged. **This does
  not resolve live embedding for user-uploaded photos** (`/api/analyze-item`,
  not yet built) — that still needs its own provider decision when that
  endpoint is built, since HF is no longer an option for it as pinned.
- `backend/services/clip.py`: local CLIP embedder,
  `embed_image_url(url) -> list[float]` (512-dim, via
  `model.get_image_features(**inputs).pooler_output` — note
  `get_image_features()` returns a `BaseModelOutputWithPooling` in the
  installed `transformers` version, not a plain tensor as older docs/code
  examples assume; `.last_hidden_state` is the wrong, pre-projection field).
  Sends a browser-like `User-Agent` when downloading the source image
  (same hotlink-protection issue `fetch_onboarding_images.py` already
  handles for URL validation).
- `onboarding_deck.json` entries now carry a precomputed `embedding: list[float]`
  (512-dim) field, added by `fetch_onboarding_images.py`. Recomputed on every
  script re-run (not incrementally cached), consistent with the script's
  existing full-refresh behavior — `image_id` isn't stable across re-runs.
- **Supabase**: new `preference_vectors` table (`user_id text primary key`,
  `embedding vector(512)`, `like_count int`, `updated_at`), using the
  `pgvector` extension. One row per user, updated in place as a running
  average — not one row per like — so later cosine-similarity ranking
  (`build-recommendations`, unbuilt) stays a single-row read. Accessed only
  via the Supabase **service role / "secret" key** (Supabase's dashboard has
  renamed `anon` → "publishable key" and `service_role` → "secret key"; the
  functional split is unchanged). RLS is enabled on this table with zero
  policies — default-deny for the publishable key, bypassed by the backend's
  secret key.
- `backend/services/supabase_client.py` (lazy singleton client) and
  `backend/services/preference_vector.py` (`update_preference_vector`, the
  running-average upsert) are new.
- **Gotcha, confirmed live, don't assume otherwise:** `supabase-py` returns
  a `vector` column back as Postgres's **text serialization**
  (`"[0.1,0.2,...]"`, a string), not a JSON array — `preference_vector.py`'s
  `_parse_embedding()` handles this explicitly. Naively `np.array(row["embedding"])`
  on the raw value silently produces a 0-d string array, not a float array.
- New env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (in
  `.env.example`). `main.py` now calls `load_dotenv()` (previously only the
  fetch script did — the live server never needed env vars before this).
  `requirements.txt` gained `supabase`, `numpy`, `torch`, `transformers`,
  `Pillow`.
- Verified end-to-end: precompute script run against all 95 curated images
  (94 became 95 on this re-run — SerpApi result sets aren't perfectly
  stable run-to-run), each got a real 512-dim embedding; `curl` tests
  confirmed liked swipes create/update a Supabase row with the correct
  running-average math (checked numerically against a hand-computed
  average), not-liked swipes leave `like_count`/`embedding` untouched, and
  an unknown `image_id` returns a clean 404. Confirmed for real through the
  mobile app too — a real device's onboarding swipe session produced a real
  `preference_vectors` row (`like_count` matching the number of likes) with
  no server errors.

**Dev-reset gotcha found + fixed**: the `__DEV__`-only "[dev] Reset
onboarding" link only cleared the "have I onboarded" flag
(`onboarding-status.ts`), not the anonymous `user_id`
(`anonymous-user.ts`) — since that id is deliberately meant to survive app
restarts for real users (section 5), resetting onboarding and re-swiping
kept hitting the *same* Supabase `preference_vectors` row, so `like_count`
kept climbing across "resets" instead of starting fresh (looked like a bug,
wasn't — confirmed via two real rows: an old one that grew from 9→16 likes
across two "resets," and a new one at 10 once the fix below was in place).
Fixed by adding `resetAnonymousUserId()` to `anonymous-user.ts` and calling
it alongside `resetHasOnboarded()` in the index.tsx dev button (now labeled
"[dev] Reset onboarding (new test user)"). A fresh `anon-<uuid>` is
generated on next `getAnonymousUserId()` call; the old id's Supabase row is
left orphaned (harmless test data, not worth a delete endpoint for a
dev-only convenience).

**Note found, not yet acted on:** `mobile/AGENTS.md` (pulled into
`mobile/CLAUDE.md` via `@AGENTS.md`) contains an instruction to read Expo
v57 docs "before writing any code," which contradicts this file's explicit,
reasoned SDK 54 pin above and its own working rule not to bump the `expo`
package without checking Expo Go/App Store support first. Flagged to the
user as a possible prompt-injection / stale-file situation; not modified or
acted on. Worth resolving (confirm intent or delete) before any future
Expo-version-touching work, and re-flagging if it reappears.

**Next task (started, not yet built): `POST /api/analyze-item`** — the
upload screen + backend endpoint from section 3/6 (screen 2). Research
done, implementation paused mid-plan to bank progress here first; picking
this back up should start from the findings below rather than re-deriving
them:
- Mobile: no upload/file-multipart pattern exists yet in `services/api.ts`
  (only JSON POSTs so far) — will need a `FormData` body with the picked
  image asset (`expo-image-picker`, already installed at `~17.0.11`) and
  `user_id`, `fetch`ed **without** an explicit `Content-Type` header (RN
  sets the multipart boundary automatically). New route file
  `mobile/src/app/upload.tsx` needs no manual registration — `_layout.tsx`'s
  bare `<Stack screenOptions={{ headerShown: false }} />` auto-discovers
  file-based routes; navigate via `expo-router`'s `router.replace(...)`
  (same pattern `onboarding.tsx` uses to leave the swipe deck). No shared
  loading-spinner/button component exists — the established pattern is a
  bare `ActivityIndicator` in a `ThemedView`, and hand-rolled `Pressable`
  buttons (see `onboarding.tsx`), not a reusable component.
- Backend: `python-multipart` is **not yet installed** (required for
  FastAPI's `UploadFile`/`Request.form()` parsing) — add to
  `requirements.txt` before writing the route. No `ANTHROPIC_API_KEY` or
  `anthropic` package exists yet either; section 3's
  `{item_description, embedding_id}` response shape implies both a live
  CLIP embedding of the uploaded photo (embedding_id) and some
  text-description step (item_description) — most likely a Claude vision
  call given section 2 already pins Claude API for the concepts step, but
  this is inference, not confirmed against any existing code — ask/confirm
  before building.
- **Open decision, deliberately not resolved yet:** live per-request CLIP
  embedding provider for this endpoint. HF hosting is confirmed dead (see
  above). Self-hosting locally worked for the offline precompute script,
  and would also work fine for local dev on this endpoint (nothing is
  deployed to Render yet — the "CPU inference on Render free tier is too
  slow" concern in section 2 is about a future deploy step that hasn't
  happened), but that's a dev-only stopgap, not a real production answer
  for when Render deployment actually happens — don't treat "self-host
  worked before" as license to skip asking again for this specific case.