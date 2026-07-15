// Groups the backend's fine-grained onboarding-image tags into a handful of
// tappable buckets for the pre-swipe style picker (see onboarding.tsx).
// Fine-grained tags are too numerous to tap through quickly; buckets exist
// purely for the picker UI + client-side deck filtering, not the tags
// themselves (those still live on each OnboardingDeckItem for later use in
// the LLM taste-summary and curation auditing).
export const STYLE_BUCKETS: Record<string, string[]> = {
  'Classic & Polished': ['classic-timeless', 'quiet-luxury', 'preppy', 'workwear'],
  'Casual & Cozy': ['cozy-casual', 'minimalist', 'athleisure'],
  'Bold & Street': ['streetwear', 'colorful-maximalist', 'eclectic-vintage'],
  'Romantic & Boho': ['romantic', 'boho'],
};

// Explicit skip/default option, shown alongside the buckets above.
export const SHOW_ME_A_MIX = 'Not sure — show me a mix';
