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
  → { deck: [{ image_id: string, image_url: string }] }   // 15-20 items

POST /api/onboarding-swipe
  body: { user_id: string, image_id: string, liked: boolean }
  → { status: "ok" }
  // Embeds the image (or uses a precomputed embedding) and folds it into
  // the user's preference vector.

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

---

## 4. Phased build plan

**Phase 1 — swipe onboarding + core recommendation loop (target: end of June)**
- Anonymous auth on first launch.
- Onboarding swipe deck (fixed set of 15–20 images), builds initial
  preference vector.
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

1. **Onboarding swipe screen** — first launch only.
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