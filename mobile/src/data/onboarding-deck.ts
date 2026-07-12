export type OnboardingDeckItem = {
  image_id: string;
  image_url: string;
};

// Mock stand-in for POST /api/onboarding-deck (CLAUDE.md section 3).
// Fixed/curated set of outfit images for onboarding, per section 4 Phase 1.
// Picsum seeded images act as placeholders until real curated outfit
// photography is sourced.
export const ONBOARDING_DECK: OnboardingDeckItem[] = Array.from({ length: 18 }, (_, i) => {
  const id = `onboard-${i + 1}`;
  return {
    image_id: id,
    image_url: `https://picsum.photos/seed/${id}/600/800`,
  };
});
