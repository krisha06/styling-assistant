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

1. **Onboarding**: user picks up to 15 outfit photos they like (own camera
   roll, saved from Pinterest, or elsewhere) via `expo-image-picker`. Each
   gets CLIP-embedded and folded into the preference vector — no swiping,
   no curated pool involved on the client side (see Phase 2 in section 4;
   replaced the original swipe-deck onboarding).
2. **Preference vector**: running average of all liked embeddings, one row
   per user in Supabase (`preference_vectors`).
3. **Ongoing learning**: liking a recommendation (heart icon, no explicit
   pass) re-embeds its images and folds them into the same running average.
4. **Applying it**: the vector biases *which items* `generate-concepts`
   suggests, via a nearest-neighbor-tags text summary against a fixed
   95-image *tagged* pool (`onboarding_deck.json`, backend-only data — not
   swiped through anymore, just used as a tag vocabulary — see section 9).
   This works regardless of how the vector itself was built (photo-upload
   fold-in or recommendation likes), since the lookup only touches the
   final vector, never the uploaded photos themselves. The vector does
   **not** rank *which photo* represents an item — `build-recommendations`
   takes the first valid SerpApi result per item, no CLIP ranking. This was
   a deliberate speed/quality tradeoff, not an oversight (section 9).

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
| Backend | Python 3.13 + FastAPI | Not deployed anywhere yet; local dev only |
| Hosting | Render (free tier), when deployed | CPU-inference speed there is unverified — open risk |
| Item embeddings | **CLIP, self-hosted** (`transformers`, `openai/clip-vit-base-patch32`, CPU) | Not HF Inference API (no longer hosts CLIP) or Replicate (not free) |
| Description + concepts | **Gemini API** (`gemini-3.5-flash`, `google-genai`) | Not Claude — cost. Claude is unused anywhere in this codebase. |
| Reference images | Google Images via SerpApi, per individual item | Not per full outfit, no ranking — section 1 point 4 |
| Auth | **Real Supabase Auth**, email/password only, no guest mode | Mobile holds the session (`@supabase/supabase-js` + `AsyncStorage`); backend verifies the access token on every request (section 9) instead of trusting a client-supplied id |
| DB | Supabase (Postgres + `pgvector`) | Tables: `preference_vectors`, `analyzed_items` (section 9) |

Ask before adding a package/service not listed here.

---

## 3. Backend API contract

All six endpoints are real and verified live. **Every one requires
`Authorization: Bearer <supabase access_token>`** — `user_id` is derived
server-side from that verified token (section 9), never taken from the
request body anymore.

```
POST /api/onboarding-photo-upload
  body: multipart/form-data { images: File[] }
  → { status: "ok", processed: int, total: int }
  // Embeds each photo via CLIP, folds into running-average vector.
  // Best-effort: a bad file is skipped (logged), not a hard failure.

GET /api/onboarding-status
  → { has_onboarded: bool }
  // has_onboarded = a preference_vectors row exists for this user.
  // Drives client-side routing (section 6) — no local "seen onboarding"
  // flag anymore, so it's correct across reinstalls/second devices.

POST /api/analyze-item
  body: multipart/form-data { image }
  → { item_description, embedding_id }
  // description: Gemini, garment-only prompt. embedding: local CLIP.
  // Stored in analyzed_items (write-only — nothing reads embedding_id back yet).

POST /api/generate-concepts
  body: { item_description }
  → { concepts: [{ vibe_label, items: string[], explanation }] }  // exactly 3-4
  // Gemini + taste-summary bias (nearest-neighbor tags, recomputed per call,
  // not stored). No bias if user has no preference_vectors row.

POST /api/build-recommendations
  body: { concepts: [{vibe_label, items, explanation}] }
  → { recommendations: [{ vibe_label, explanation,
        images: [{ item, image_url, source }] }] }
  // Per-item search (up to 4/concept), first live SerpApi result, no ranking.

POST /api/recommendation-feedback
  body: { image_urls: string[] }
  → { status: "ok" }
  // No recommendation_id (recommendations aren't persisted) — client sends
  // back the liked card's image_urls; each re-embedded + folded into vector.
  // Best-effort: a dead image_url is skipped, not a hard failure.
```

Also exists, **not** part of this contract — `POST /api/onboarding-dev-seed`
(same auth requirement, no body → `{ status, processed }`), dev/testing-only,
folds 15 random precomputed pool embeddings straight into the vector so
manual QA doesn't require hand-picking photos. Pull before any real deploy
(section 9).

---

## 4. Phased build plan

**Phase 1 — swipe onboarding + core recommendation loop — ✅ complete.**
Onboarding, upload→analyze→concepts→recommendations, and the like-feedback
loop are all built and verified live on a real device. Real anonymous auth
was rescoped into Phase 2 (see below) rather than left as a Phase 1 gap.
The swipe-deck onboarding built here was fully replaced by photo-upload
onboarding early in Phase 2 (see below) — `react-native-deck-swiper` is no
longer in the app.

**Phase 2 — accounts + persistence + polish (mid-July)**
- ✅ **Photo-upload onboarding — built.** User multi-selects up to 15
  outfit photos they like (own photos, saved from Pinterest, or elsewhere)
  via `expo-image-picker`; each is CLIP-embedded and folded into the
  preference vector — same fold-in mechanism `recommendation-feedback`
  already used, just via uploaded files instead of URLs. Fully replaces the
  swipe deck (not additive — the style/age self-select step and the
  curated-pool swipe UI are gone). Pulled forward from Phase 4 since it
  needs no OAuth. Built before real auth landed (used the local anonymous
  `user_id` at the time); now requires a verified session like every other
  endpoint, per the auth bullet below. The tags open-question turned out to
  be a non-issue: `generate-concepts`' taste-summary bias never looks at
  what built the vector, only the final vector's nearest neighbors in the
  still-tagged 95-image pool (section 1 point 4) — so untagged uploaded
  photos don't break it. Also added `POST /api/onboarding-dev-seed`
  (dev-only, section 3) so QA can skip manual photo-picking. Has a third
  `'preparing'` stage (`onboarding.tsx`) between picking and saving — with
  up to 15 photos, the native picker handing back asset objects can take a
  beat, and with no feedback the screen looked frozen right after picking
  (real user-reported issue, not hypothetical).
- ✅ **Real email/password auth — built.** Mandatory gate (`login.tsx`),
  no guest/anonymous mode at all — this deliberately dropped "anonymous
  auth" and "anonymous→permanent migration" from the original Phase 2
  wording once the UX was talked through: there's no guest identity left
  to migrate *from*. Backend verifies the Supabase access token on every
  request (`services/auth.py`'s `get_current_user_id`, section 9) instead
  of trusting a client-supplied `user_id` — closes a real gap where any
  client could previously pass any `user_id` and touch someone else's
  preference vector. All prior `anon-*` test rows in
  `preference_vectors`/`analyzed_items` are now orphaned test data
  (harmless — nothing deployed, no real users yet). Backend fully verified
  live (real signup + every endpoint driven with a real access token via
  `curl`); the actual on-device mobile UX (login/signup screens, the
  gate/redirect logic, loading states) has **not** yet been run through by
  hand — pending as of writing, don't assume it's polished until confirmed.
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

**Phase 4 — stretch (Aug, optional).** No items currently scoped. The
original entry here — seed the preference vector from the user's own
photos — was pulled forward into Phase 2 (see above) once the OAuth-free
`expo-image-picker` approach made it cheap enough not to wait for.
Originally scoped as Pinterest OAuth import; **blocked** — Pinterest's
developer program requires a live app link to register, which doesn't
exist pre-launch.

**Phase 5 — buffer + demo prep (Aug).**

**Cut order:** Phase 4 → Phase 3 → Phase 2 → polish. Phase 1 can't be cut.

---

## 5. Risks

- **Cold-start / personalization strength** — mechanism works, real-world
  effect over sustained use is unverified (section 1).
- **Render CPU inference speed** — unverified; CLIP + Gemini now run in
  live request paths, nothing deployed to Render yet to test.
- **Supabase's shared email service has a very low send-rate limit**
  (hit `over_email_send_rate_limit` on the very first live test signup) —
  a real constraint if email flows (confirmation, password reset) are ever
  turned back on. Deliberately worked around, not fixed: "Confirm email"
  is disabled in the dashboard (user's call), so `signUp()` never sends an
  email at all — `services/auth.ts` assumes a session comes back
  immediately, no defensive branch.
- **Third-party API/model availability drift** — bit multiple times this
  build (HF dropped CLIP hosting, `gemini-2.0-flash` became unavailable,
  Replicate turned out not free). Verify live before building on any
  external provider assumption, don't trust cached knowledge.
- **Expo Go limitations** — ✅ non-issue, confirmed working.

---

## 6. Mobile app screens

1. **Login** (`login.tsx`) — mandatory gate, no guest mode. Toggles between
   sign-up/log-in, email + password. `index.tsx` (not really a screen —
   pure routing logic) decides where to land: no session → `/login`;
   session but `GET /api/onboarding-status` says not onboarded → `/onboarding`;
   else shows the home screen with a "Log out" button.
2. **Onboarding** (`onboarding.tsx`) — single-stage photo picker: multi-select
   up to 15 liked outfit photos (thumbnail grid confirms selection), plus a
   `__DEV__`-only auto-fill button.
3. **Upload** (`upload.tsx`) — combines original screens 2-4: photo picker
   → 3 loading stages → concept cards (heart icon, image carousel with dot
   pagination, explanation). Temporary combined shape, not final design.
4. *(Phase 2)* History screens.

---

## 7. Repo structure

```
/mobile        Expo app (expo-router)
  /src/app       Screens: index (routing only), login, onboarding, upload
  /src/services  api.ts, auth.ts, supabase.ts
/backend       FastAPI app
  main.py        App setup, CORS, router registration, /health
  /routes        onboarding, item, concepts, recommendations, recommendation_feedback
  /services      auth (token verification), CLIP, Gemini (+client/error/retry
                  helpers), SerpApi, Supabase, preference-vector math, taste-summary
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
both were tried mid-build and dropped. **Env vars** (`mobile/.env`, new):
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the anon key
is safe to ship in the client bundle by design (mobile only talks to
Supabase Auth directly; all `preference_vectors`/`analyzed_items` access
stays backend-mediated through the service-role client, unchanged).

**Key versions**: `expo ^54.0.0`, `react-native 0.81.5`,
`expo-router ~6.0.24`, `expo-image-picker ~17.0.11`, `expo-symbols ~1.0.8`,
`@supabase/supabase-js` + `react-native-url-polyfill` (added for real
auth). `expo-crypto` removed (only used by the deleted local-anonymous-id
scheme).

**Auth verification** (`backend/services/auth.py`'s `get_current_user_id`):
verified live against the installed `supabase-py==2.31.0`
(`supabase_auth/_sync/gotrue_client.py`) that `client.auth.get_user(jwt)`
sends the *passed* `jwt` as the bearer for that one request, regardless of
which key the client itself was built with — so the existing service-role
client (`services/supabase_client.py`) doubles as the token verifier, no
second client or extra backend env var needed. Missing `Authorization`
header → FastAPI's own 422 (required-header validation, before the
dependency runs); malformed/expired/invalid token → 401 from the
dependency itself. Both verified live via `curl`.

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

**Gotcha — `supabase-js` `signOut()`**: still makes a network call
(`POST /logout`) even with `scope: 'local'` — that scope only changes
server-side semantics (revoke this session vs. every session), it doesn't
skip the request. Verified live against the installed `@supabase/auth-js`:
a genuine network failure on that call is *re-thrown*, not returned as
`{error}` like most other auth methods. First surfaced as a real bug — the
home screen's "Log out" button (`index.tsx`) called `signOut()` directly as
`onPress` with no `.catch()`, so a transient network blip during that call
became a full unhandled-rejection error screen instead of just logging out.
Fixed by wrapping the call (`onPress={() => signOut().catch(() => {})}`,
`services/auth.ts`) — any auth method that hits the network needs the same
treatment, don't assume `{error}`-style returns cover every failure mode.

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
