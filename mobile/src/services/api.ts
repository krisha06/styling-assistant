import { ONBOARDING_DECK, type OnboardingDeckItem } from '@/data/onboarding-deck';

// Mock implementations of the backend API contract from CLAUDE.md section 3.
// Swap each function for a real fetch() call to the FastAPI backend once
// the corresponding endpoint exists — per working rule #2, UI/data flow is
// proven against mocks first.

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
}

export async function getOnboardingDeck(): Promise<OnboardingDeckItem[]> {
  // Real: POST /api/onboarding-deck -> { deck: [...] }
  return delay(ONBOARDING_DECK);
}

export async function postOnboardingSwipe(imageId: string, liked: boolean): Promise<void> {
  // Real: POST /api/onboarding-swipe { user_id, image_id, liked } -> { status: "ok" }
  console.log(`[mock] onboarding-swipe: ${imageId} liked=${liked}`);
  await delay(undefined);
}
