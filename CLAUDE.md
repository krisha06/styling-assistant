# CLAUDE.md

Read automatically at the start of every session. Single source of truth —
kept intentionally concise; see git log for narrative history behind any
decision below.

## 0. What this is

React Native + Expo app: photograph a clothing item, get 3-4 outfit
concepts with per-item reference photos. Likes train a per-user CLIP
preference vector (running average, not a trained model) so
recommendations personalize over time. No shopping links — mood board /
taste tool only. ~10 weeks, phased (section 4).

## 1. Preference-learning core

1. **Onboarding**: user picks up to 15 liked outfit photos via
   `expo-image-picker`; each is CLIP-embedded and folded into the
   preference vector. Reusable post-onboarding too (home's "Add more
   outfits").
2. **Preference vector**: running average of liked embeddings, one row
   per user (`preference_vectors`).
3. **Ongoing learning**: liking a recommendation re-embeds and folds its
   images in the same way.
4. **Applying it**: the vector biases *which items* `generate-concepts`
   suggests via nearest-neighbor tags against a 95-image tagged pool
   (`onboarding_deck.json`). Doesn't rank *which photo* —
   `build-recommendations` takes the first valid SerpApi result, no CLIP
   ranking (speed/quality tradeoff).

**Unverified**: real-world effect of personalization over sustained use
hasn't been measured. Phase 3 question, not a solved feature.

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile | React Native + Expo (managed), `expo-router` | SDK pinned to **54** — check Expo Go/App Store support before bumping |
| Backend | Python 3.13 + FastAPI | Local dev only, not deployed |
| Hosting | Render (free tier), when deployed | CPU-inference speed there is unverified |
| Item embeddings | CLIP, self-hosted (`transformers`, CPU) | Not HF Inference API or Replicate |
| Description + concepts | Gemini API (`gemini-3.5-flash`) | Not Claude — cost |
| Reference images | Google Images via SerpApi, per item | No cross-item ranking |
| Auth | Real Supabase Auth, email/password, no guest mode | Backend verifies access token every request (section 9) |
| DB | Supabase (Postgres + pgvector) | Tables in section 9 |

Ask before adding a package/service not listed here.

## 3. Backend API contract

All endpoints require `Authorization: Bearer <supabase access_token>`;
`user_id` is derived server-side, never from the request body.

```
POST /api/onboarding-photo-upload  multipart{images: File[]} → {status, processed, total}
GET  /api/onboarding-status        → {has_onboarded}  // drives client routing, section 6
POST /api/analyze-item             multipart{image} → {item_description, embedding_id}
POST /api/generate-concepts        {item_description} → {concepts: [{vibe_label, items[], explanation}]}  // 3-4
POST /api/build-recommendations    {concepts} → {recommendations: [{id, vibe_label, explanation, images[]}]}
POST /api/recommendation-feedback  {recommendation_id} → {status}  // scoped to user_id (section 9)
GET  /api/recommendation-history   → {recommendations: [...+liked, created_at]}  // newest first, capped 100
POST /api/onboarding-dev-seed      (dev-only, not in contract) → {status, processed}
```

All best-effort where per-item failure is possible (bad file, dead image
URL) — logged and skipped, not a hard failure.

## 4. Phased build plan

**Phase 1 — swipe onboarding + core recommendation loop — ✅ complete.**
Onboarding, upload → analyze → concepts → recommendations, and the
like-feedback loop, all built and verified live on a real device. The
swipe-deck onboarding built here was fully replaced by photo-upload
onboarding in Phase 2 — `react-native-deck-swiper` is no longer in the app.

**Phase 2 — accounts + persistence — ✅ complete.**
- Photo-upload onboarding replaced the swipe deck; same screen now doubles
  as "Add more outfits" post-onboarding.
- Real email/password auth, mandatory gate, no guest mode. Backend
  verified live; mobile UX not formally walked through end to end.
- Recommendation + like history persisted (`recommendations` table,
  section 9); `recommendation-feedback` takes `recommendation_id`, not raw
  `image_urls` — closes an ownership gap. New `history.tsx` screen.
  Backend verified live; mobile flow blocked on Gemini 503s, unconfirmed.
- Error/loading polish: distinct error color, History retry button,
  friendlier Gemini-overload message.

**Phase 3 — preference tuning + security.**
- Measure whether personalization has a noticeable real-world effect
  (section 1); recency weighting; possibly revisit CLIP ranking in
  `build-recommendations`. `analyzed_items.embedding_id` (write-only
  today) may be relevant infra for a "why this was recommended" signal.
- Security testing — scope TBD.

**Phase 4 — polish + user testing.**
- UI/UX polish pass (portfolio piece); close out Phase 2's unverified
  mobile flows (recommendation history, general auth UX) along the way.
- Real user testing — scope TBD.

**Cut order:** Phase 4 → Phase 3. Phases 1-2 are done, not cuttable.

## 5. Risks

- Cold-start / personalization strength unverified (section 1).
- Render CPU inference speed unverified — nothing deployed yet to test.
- Supabase's shared email service has a very low send-rate limit — worked
  around (not fixed) by disabling "Confirm email"; `signUp()` assumes an
  immediate session, no defensive branch.
- Third-party API/model availability drifts (HF dropped CLIP hosting, a
  Gemini model version disappeared, Replicate wasn't actually free) —
  verify live, don't trust cached knowledge.

## 6. Mobile app screens

1. **Login** (`login.tsx`) — mandatory gate, email/password, distinct
   login/signup copy. `index.tsx` (routing only): no session → `/login`;
   not onboarded → `/onboarding`; else home.
2. **Onboarding** (`onboarding.tsx`) — photo picker, up to 15, `__DEV__`
   auto-fill. Reused post-onboarding via home's "Add more outfits."
3. **Upload** (`upload.tsx`) — photo → 3 loading stages → concept cards.
   Card UI in `components/recommendation-card.tsx`, shared with History.
4. **History** (`history.tsx`) — past cards via
   `GET /api/recommendation-history`, same card component.

## 7. Repo structure

```
/mobile        Expo app (expo-router)
  /src/app       Screens: index (routing only), login, onboarding, upload, history
  /src/services  api.ts, auth.ts, supabase.ts
/backend       FastAPI app
  main.py        App setup, CORS, router registration, /health
  /routes        onboarding, item, concepts, recommendations, recommendation_feedback
  /services      auth (token verification), CLIP, Gemini (+client/error/retry
                  helpers), SerpApi, Supabase, preference-vector math, taste-summary
  /scripts       fetch_onboarding_images.py (one-time, manual)
CLAUDE.md
```

## 8. Working rules

1. One phase at a time.
2. Mock external APIs first, wire real ones in one at a time, test each.
3. Never assume a third-party API's shape or a model's availability —
   verify live (this bit for real, multiple times).
4. Confirm before moving on — actually run and verify, don't assume done.
5. Secrets in `.env`, never hardcoded, never printed to chat.
6. Ask, don't guess — including on cost/provider tradeoffs.

## 9. Implementation notes

**Env vars**: backend `.env` — `SERPAPI_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`. Mobile `.env` —
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (anon key is
safe client-side; DB access stays backend-mediated via the service-role
key). Key versions: `expo ^54.0.0`, `react-native 0.81.5`,
`expo-router ~6.0.24`, `expo-image-picker ~17.0.11`.

**Auth**: `get_current_user_id` (`services/auth.py`) passes the client's
JWT into `client.auth.get_user(jwt)` — the service-role client doubles as
token verifier, no second client needed. Missing header → 422;
invalid/expired token → 401.

**Supabase schema** (RLS-enabled/zero-policy, service-role key only,
hand-created via SQL editor — no migrations in this repo):
- `preference_vectors`: `user_id text pk`, `embedding vector(512)`,
  `like_count int`, `updated_at` (doesn't auto-refresh, don't rely on it).
- `analyzed_items`: `embedding_id uuid pk`, `user_id`, `embedding
  vector(512)`, `item_description`, `created_at`. Write-only.
- `recommendations`: `id uuid pk`, `user_id`, `vibe_label`, `explanation`,
  `images jsonb`, `liked bool default false`, `created_at`. One row per
  concept card, scoped to `user_id` on update.

**Gotchas**:
- `supabase-py` returns `vector` columns as a string, not JSON — use
  `embedding_utils.parse_pgvector()`.
- `supabase-js signOut({scope:'local'})` still hits the network and
  re-throws on failure instead of returning `{error}` — wrap in `.catch()`.
- Gemini: `generate_content_with_retry()` retries once on 503;
  `raise_for_gemini_error()` maps 429/503 to friendly messages, mirrored in
  mobile's `RateLimitedError`/`OverloadedError` (`api.ts`).
- SerpApi queries append style-photo terms + `tbs=itp:photo`, and block
  Pinterest/TikTok/Instagram/Facebook CDN hosts directly (`reference_images.py`).
- `mobile/AGENTS.md` tells Claude to read Expo v57 docs, contradicting the
  SDK 54 pin — unresolved, resolve before any Expo-version work.
