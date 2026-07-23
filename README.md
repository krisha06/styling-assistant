# Curated: Visual Style Discovery

> Take the guesswork out of styling

While shopping, my friends and I always find ourselves asking "Will I actually wear this?". I know this rings true for many people, no one wants clothing to just sit unused in their closet for a year. This app solves this issue, allowing you to quickly gauge whether or not you will wear a piece with a personalized moodboard. Upload pictures of your favorite outfits, either your own or from online or from a friend! Then, find pieces while thrifting, or at the mall and upload it for personalized style recommendations. Tada! No more uncertainty, no more guesswork, jsut beautiful outfits!

Built from June 2026-Present as a React Native / Expo mobile app.

---

## Demo

https://github.com/user-attachments/assets/0a8c6be9-bcea-4c94-8270-948bb442f3f4

---

## Product Reasoning

A few decisions shaped what this app is...

- **Uploading pictures of favorite outfits** Asking someone to describe their style in words up front is high-friction and inaccurate its hard to have vocab for complex tastes. At first, I made it a Tinder-style onboarding where users swipe right on outfits they like. However, its impossible to  fit every single possible style into a couple of swipes. Instead, I made it visual and personable allowing the user to upload what they love on their own.
- **Pure mood board, not commerce.** I started with a shopping-oriented flow (surfacing buyable items via product APIs), but that optimized for the wrong thing it pushed toward "what's purchasable" instead of "what actually matches your taste. I wanted its purpose to serve more as an outfit mood board for inspiration.
- **Per-user embedding vectors instead of static categories/tags.** Style doesn't fit neatly into predefined categories ("boho," "minimalist," etc.), and tags decay in usefulness fast. Representing each user's taste as an evolving vector in CLIP's embedding space lets the app capture nuance a tag system can't, and it updates continuously as you swipe.
- **Image search backend iterated twice.** Started with Lykdat (fashion-specific but limited coverage), moved to SerpApi's Google Shopping results (broader but too commerce-skewed), and landed on SerpApi's Google Images results — the best fit for pure visual discovery without forcing a purchase intent.

---

## Inspiration


## How It Works

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────────────┐
│  React Native /  │ ───▶ │   FastAPI     │ ───▶ │  Gemini — outfit      │
│  Expo Go (client)│      │   backend     │      │  concepts             │
└─────────────────┘      └──────┬───────┘      └─────────────────────┘
                                  │                          │
                                  ▼                          ▼
                         ┌──────────────────┐      ┌─────────────────────┐
                         │  CLIP embeddings  │      │  SerpApi (Google     │
                         │  (image vectors)  │      │  Images) — reference  │
                         └────────┬─────────┘      │  photos per item      │
                                  │                  └─────────────────────┘
                                  ▼
                     ┌────────────────────────────┐
                     │  Supabase / pgvector         │
                     │  — stores per-user preference │
                     │    vectors, updates on like    │
                     └────────────────────────────┘
```

1. Onboarding: the user uploads photos of outfits they like; each is CLIP-embedded and folded into their preference vector.
2. To get recommendations, the user photographs a clothing item — CLIP embeds it, Gemini describes it and generates 3-4 outfit concepts biased toward the user's preference vector.
3. Each concept's items get reference photos via SerpApi (Google Images).
4. Liking a recommendation re-embeds its images and folds them into the preference vector too — so future concepts keep sharpening.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React Native, Expo Go |
| Backend | FastAPI (Python) |
| Auth | Supabase Auth (email/password) |
| Database | Supabase (Postgres + pgvector) |
| ML / Embeddings | CLIP |
| Image description generation | Gemini |
| Image sourcing | SerpApi (Google Images) |
| AI Tool | Claude Code |
---

## Known Limitations & What's Next

- Getting real user feedback from friends and making improvements
- Improving UI to be more intuitive
- Backend runs locally on my own laptop, not deployed, no production server yet, so it's not usable outside of local dev.
- Personalization strength over sustained use hasn't been measured yet, the preference vector is a running average, not a trained model, and whether it noticeably improves recommendations over time is an open question.
- Image sourcing is dependent on SerpApi rate limits, exploring a caching layer to reduce redundant calls.
- Reference photos are picked as the first valid SerpApi result per item, not ranked by CLIP similarity — a speed/quality tradeoff that may get revisited.
- Would like to add lightweight explainability (e.g. "you're drawn to warm tones and structured silhouettes") using the embedding clusters that already exist under the hood.


---

## Running Locally

```bash
# backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# frontend
cd mobile
npm install
npx expo start
```

You'll need your own Supabase project (with pgvector enabled), a SerpApi key, and a Gemini API key — see `.env.example` in each of `backend/` and `mobile/` for required variables.
