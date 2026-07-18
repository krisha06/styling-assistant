// Explicit self-select age range, same principle as style-buckets.ts: the
// user tells us directly rather than the app inferring anything. Used to
// bias which curated onboarding photos are shown (see fetch_onboarding_images.py
// for how age-tagged images are sourced) — a best-effort proxy via search
// query phrasing, not a guaranteed-accurate age match, since Google Images
// has no real demographic filter.
export const AGE_RANGES: Record<string, string> = {
  'Under 25': 'under-25',
  '25–40': '25-40',
  '40–60': '40-60',
  '60+': '60-plus',
};

export const PREFER_NOT_TO_SAY = 'Prefer not to say';
