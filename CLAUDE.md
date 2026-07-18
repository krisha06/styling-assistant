# CLAUDE.md

Read automatically at the start of every session. Single source of truth —
no separate brief doc. Kept intentionally concise; see git log / commit
messages for full narrative history behind any decision below.

---

## 0. What this is

React Native + Expo app: user photographs a clothing item, gets 3-4 outfit
concepts with individual per-item reference photos and a description. Likes
train a per-user CLIP-based preference vector (running average, not a
trained model) so recommendations personalize over time. No shopping
links — mood board / taste tool only. ~10 weeks, phased (section 4).

---

## 1. Preference-learning core (current, as-built)

1. **Onboarding**: style/age self-select narrows a fixed 95-image curated
   pool to a ~16-card swipe deck. Likes get CLIP-embedded.
2. **Preference vector**: running average of all liked embeddings, one row
   per user in Supabase (`preference_vectors`).
3. **Ongoing learning**: liking a recommendation (heart icon, no explicit
   pass) re-embeds its images and folds them into the same running average.
4. **Applying it**: the vector biases *which items* `generate-concepts`
   suggests (via a nearest-neighbor-tags text summary against the
   onboarding pool — see section 9). It does **not** rank *which photo*
   represents an item — `build-recommendations` takes the first valid
   SerpApi result per item, no CLIP ranking. This was a deliberate
   speed/quality tradeoff, not an oversight (section 9).

**Known limitation, unverified:** the personalization loop's real-world
effect over sustained use hasn't been measured — only that "some taste
bias" vs. "zero taste bias" produces different output. The running average
has diminishing returns per additional like, and the taste→words
translation is coarse (only 95 tagged images to search). Treat as a Phase
3 open question, not a solved feature.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile | React Native + Expo (managed), `expo-router` | **SDK pinned to 54** — don't bump without checking Expo Go/App Store support (section 9) |
| Swipe UI | `react-native-deck-swiper` | Has real gotchas — section 9 |
| Backend | Python 3.13 + FastAPI | Not deployed anywhere yet; local dev only |
| Hosting | Render (free tier), when deployed | CPU-inference speed there is unverified — open risk |
| Item embeddings | **CLIP, self-hosted** (`transformers`, `openai/clip-vit-base-patch32`, CPU) | Not HF Inference API (no longer hosts CLIP) or Replicate (not free) |
| Description + concepts | **Gemini API** (`gemini-3.5-flash`, `google-genai`) | Not Claude — cost. Claude is unused anywhere in this codebase. |
| Reference images | Google Images via SerpApi, per individual item | Not per full outfit, no ranking — section 1 point 4 |
| Auth | **Local-only anonymous id** (`AsyncStorage` + `expo-crypto`) | Real Supabase anonymous auth is Phase 2 scope, not Phase 1 |
| DB | Supabase (Postgres + `pgvector`) | Tables: `preference_vectors`, `analyzed_items` (section 9) |

Ask before adding a package/service not listed here.

---

## 3. Backend API contract

All six endpoints are real and verified live.

```
POST /api/onboarding-deck
  → { deck: [{ image_id, image_url, tags: string[] }] }

POST /api/onboarding-swipe
  body: { user_id, image_id, liked: boolean }
  → { status: "ok" }
  // Folds liked image's embedding into running-average vector. Passes are no-ops.

POST /api/analyze-item
  body: multipart/form-data { image, user_id }
  → { item_description, embedding_id }
  // description: Gemini, garment-only prompt. embedding: local CLIP.
  // Stored in analyzed_items (write-only — nothing reads embedding_id back yet).

POST /api/generate-concepts
  body: { item_description, user_id }
  → { concepts: [{ vibe_label, items: string[], explanation }] }  // exactly 3-4
  // Gemini + taste-summary bias (nearest-neighbor tags, recomputed per call,
  // not stored). No bias if user has no preference_vectors row.

POST /api/build-recommendations
  body: { concepts: [{vibe_label, items, explanation}], user_id }
  → { recommendations: [{ vibe_label, explanation,
        images: [{ item, image_url, source }] }] }
  // Per-item search (up to 4/concept), first live SerpApi result, no ranking.

POST /api/recommendation-feedback
  body: { user_id, image_urls: string[] }
  → { status: "ok" }
  // No recommendation_id (recommendations aren't persisted) — client sends
  // back the liked card's image_urls; each re-embedded + folded into vector.
  // Best-effort: a dead image_url is skipped, not a hard failure.
```

---

## 4. Phased build plan

**Phase 1 — swipe onboarding + core recommendation loop — ✅ complete.**
Onboarding, upload→analyze→concepts→recommendations, and the like-feedback
loop are all built and verified live on a real device. Real anonymous auth
was rescoped into Phase 2 (see below) rather than left as a Phase 1 gap.

**Phase 2 — accounts + persistence + polish (mid-July)**
- Real anonymous Supabase auth **+** real signup/login **+**
  anonymous→permanent migration, built together (not anonymous auth in
  isolation — avoids touching auth code twice).
- Store past recommendations + like history in Supabase.
- Error/loading state polish (429/503 handling already exists — section 9).
- UI polish (portfolio piece).

**Phase 3 — preference tuning (late July)**
- Actually measure whether the personalization loop's effect is
  noticeable over sustained use (section 1's open question).
- Recency weighting; possibly revisit CLIP ranking in
  `build-recommendations` if per-item personalization turns out to matter.
- Lightweight "why this was recommended" signal — `analyzed_items.
  embedding_id` (currently write-only) may be relevant infra.

**Phase 4 — stretch: seed preference vector from user's own photos (Aug,
optional).** Originally scoped as Pinterest OAuth import; **blocked** —
Pinterest's developer program requires a live app link to register, which
doesn't exist pre-launch. Simpler alternative, not yet built: let the user
multi-select photos from their camera roll (e.g. exported/saved from
Pinterest) via the existing `expo-image-picker`, embed each via CLIP, fold
into the vector — same mechanism as onboarding, no OAuth needed. Lower
priority than Phases 2-3 either way.

**Phase 5 — buffer + demo prep (Aug).**

**Cut order:** Phase 4 → Phase 3 → Phase 2 → polish. Phase 1 can't be cut.

---

## 5. Risks

- **Cold-start / personalization strength** — mechanism works, real-world
  effect over sustained use is unverified (section 1).
- **Render CPU inference speed** — unverified; CLIP + Gemini now run in
  live request paths, nothing deployed to Render yet to test.
- **Anonymous auth persistence / migration** — not yet applicable, Phase 2.
- **Third-party API/model availability drift** — bit multiple times this
  build (HF dropped CLIP hosting, `gemini-2.0-flash` became unavailable,
  Replicate turned out not free). Verify live before building on any
  external provider assumption, don't trust cached knowledge.
- **Expo Go limitations** — ✅ non-issue, confirmed working.

---

## 6. Mobile app screens

1. **Onboarding** (`onboarding.tsx`) — style self-select → age self-select
   → swipe deck.
2. **Upload** (`upload.tsx`) — combines original screens 2-4: photo picker
   → 3 loading stages → concept cards (heart icon, image carousel with dot
   pagination, explanation). Temporary combined shape, not final design.
3. *(Phase 2)* Login/signup, history screens.
4. *(Phase 4)* Photo-seeding / Pinterest-adjacent screen.

---

## 7. Repo structure

```
/mobile        Expo app (expo-router)
  /src/app       Screens: index, onboarding, upload
  /src/services  api.ts, anonymous-user.ts, onboarding-status.ts
  /src/data      style-buckets.ts, age-ranges.ts
/backend       FastAPI app
  main.py        App setup, CORS, router registration, /health
  /routes        onboarding, item, concepts, recommendations, recommendation_feedback
  /services      CLIP, Gemini (+client/error/retry helpers), SerpApi,
                  Supabase, preference-vector math, taste-summary
  /scripts       fetch_onboarding_images.py (one-time, manual)
CLAUDE.md
```

---

## 8. Working rules

1. One phase at a time — don't start Phase 2 work while Phase 1 is unverified.
2. Mock external APIs first, wire real ones in one at a time, test each.
3. Never assume a third-party API's shape or a model's current
   availability — verify live (this bit for real, multiple times).
4. Confirm before moving on — actually run and verify, don't assume done.
5. Secrets in `.env`, never hardcoded, never printed to chat.
6. Ask, don't guess — including on cost/provider tradeoffs, not just
   technical ambiguity.

---

## 9. Implementation notes (condensed reference)

**Env vars** (`backend/.env`): `SERPAPI_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`. No Replicate/Anthropic key —
both were tried mid-build and dropped.

**Key versions**: `expo ^54.0.0`, `react-native 0.81.5`,
`expo-router ~6.0.24`, `expo-image-picker ~17.0.11`, `expo-crypto ~15.0.9`,
`expo-symbols ~1.0.8`, `react-native-deck-swiper ^2.0.19`.

**Supabase schema** (both RLS-enabled/zero-policy, service-role key only,
created by hand via SQL editor — no migrations in this repo):
- `preference_vectors`: `user_id text primary key`, `embedding vector(512)`,
  `like_count int`, `updated_at` (⚠️ doesn't actually refresh on update —
  no explicit set, no trigger; don't use it to find "the row that just
  changed").
- `analyzed_items`: `embedding_id uuid primary key default
  gen_random_uuid()`, `user_id text`, `embedding vector(512)`,
  `item_description text`, `created_at`. Write-only.

**Gotcha — pgvector text serialization**: `supabase-py` returns `vector`
columns as a string (`"[0.1,0.2,...]"`), not JSON. Handled centrally by
`services/embedding_utils.py`'s `parse_pgvector()` + `cosine_similarity()`.

**Gotcha — `react-native-deck-swiper`**: sizes off `Dimensions.get('window')`,
not its parent — header must be an absolute overlay, not a flex sibling.
`shouldComponentUpdate` ignores margin-prop changes — force remount via
`key={headerHeight}`. `onSwipedAll` has a last-card timing race — detect
`cardIndex === deck.length - 1` yourself. Reference: `onboarding.tsx`.

**Gotcha — Gemini reliability**: `generate_content_with_retry()`
(`gemini_client.py`) retries once on `ServerError` (503, real occurrence).
`raise_for_gemini_error()` (`gemini_errors.py`) maps 429→friendly
rate-limit message, 503(after retry)→friendly overload message, shared by
`routes/item.py` + `routes/concepts.py`. Mobile mirrors with
`RateLimitedError`/`OverloadedError` in `api.ts`.

**SerpApi query pattern** (`reference_images.py`, `fetch_onboarding_images.py`):
append `"street style photo -pinterest -collage -site:pinterest.com"`
(outfits) or `"product photo -pinterest -collage -site:pinterest.com"`
(items) + `tbs=itp:photo`, block `pinimg.com` / `tiktok.com/api/img` /
`lookaside.instagram.com` / `lookaside.fbsbx.com` directly (source-page
exclusion alone doesn't block CDN-served images). Real field names:
`images_results[].original` (image URL), `.link` (source page).

**`mobile/AGENTS.md` conflict, still unresolved**: tells Claude to read
Expo v57 docs, contradicting the SDK 54 pin. Flagged repeatedly, not
acted on — resolve before any Expo-version work.

**`build-recommendations` history**: v1 ranked full-outfit photos per
concept by CLIP similarity to preference vector (matched original plan);
looked bad in practice (photos didn't match listed items). v2 (current)
searches per item, no ranking — see section 1.

**`item_description` provider history**: Claude (planned) → local BLIP
(worked, but described the scene not the garment) → Gemini (current, fixed
the quality problem with a garment-only prompt).
