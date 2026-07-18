import Constants from 'expo-constants';

import { getAnonymousUserId } from '@/services/anonymous-user';

export type OnboardingDeckItem = {
  image_id: string;
  image_url: string;
  tags: string[];
};

const DEV_BACKEND_PORT = 8000;

// Reuses the same LAN host Expo Go already resolves to load the JS bundle
// (Constants.expoConfig.hostUri, e.g. "192.168.1.23:8081"), so the backend
// is reachable from a physical device without hand-entering an IP.
// EXPO_PUBLIC_API_BASE_URL overrides this (e.g. against a deployed Render
// URL later). Note: doesn't resolve correctly under Expo tunnel mode — not
// a concern for the current LAN dev workflow.
function inferDevApiBaseUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:${DEV_BACKEND_PORT}`;
}

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? inferDevApiBaseUrl();

export async function getOnboardingDeck(): Promise<OnboardingDeckItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/onboarding-deck`, { method: 'POST' });
  if (!res.ok) throw new Error(`onboarding-deck failed: ${res.status}`);
  const { deck } = await res.json();
  return deck;
}

export async function postOnboardingSwipe(imageId: string, liked: boolean): Promise<void> {
  const userId = await getAnonymousUserId();
  const res = await fetch(`${API_BASE_URL}/api/onboarding-swipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, image_id: imageId, liked }),
  });
  if (!res.ok) throw new Error(`onboarding-swipe failed: ${res.status}`);
}

// Thrown instead of a bare Error for backend statuses that deserve a
// friendlier message than the generic failure case — 429 (Gemini's
// free-tier rate limit) and 503 (Gemini's servers temporarily overloaded,
// surfaced after the backend's own single retry already failed).
export class RateLimitedError extends Error {}
export class OverloadedError extends Error {}

function throwForStatus(res: Response, action: string): void {
  if (res.status === 429) throw new RateLimitedError(`${action} rate limited`);
  if (res.status === 503) throw new OverloadedError(`${action} overloaded`);
  if (!res.ok) throw new Error(`${action} failed: ${res.status}`);
}

export type AnalyzeItemResult = {
  item_description: string;
  embedding_id: string;
};

export async function analyzeItem(imageUri: string): Promise<AnalyzeItemResult> {
  const userId = await getAnonymousUserId();

  const filename = imageUri.split('/').pop() ?? 'photo.jpg';
  const extensionMatch = /\.(\w+)$/.exec(filename);
  const mimeType = extensionMatch ? `image/${extensionMatch[1].toLowerCase()}` : 'image/jpeg';

  const formData = new FormData();
  // RN's FormData accepts { uri, name, type } in place of a Blob/File.
  formData.append('image', { uri: imageUri, name: filename, type: mimeType } as unknown as Blob);
  formData.append('user_id', userId);

  // No explicit Content-Type header — RN sets the multipart boundary itself.
  const res = await fetch(`${API_BASE_URL}/api/analyze-item`, {
    method: 'POST',
    body: formData,
  });
  throwForStatus(res, 'analyze-item');
  return res.json();
}

export type Concept = {
  vibe_label: string;
  items: string[];
  explanation: string;
};

export async function generateConcepts(itemDescription: string): Promise<Concept[]> {
  const userId = await getAnonymousUserId();
  const res = await fetch(`${API_BASE_URL}/api/generate-concepts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_description: itemDescription, user_id: userId }),
  });
  throwForStatus(res, 'generate-concepts');
  const { concepts } = await res.json();
  return concepts;
}

export type RecommendationImage = {
  item: string;
  image_url: string;
  source: string;
};

export type Recommendation = {
  vibe_label: string;
  explanation: string;
  images: RecommendationImage[];
};

export async function buildRecommendations(concepts: Concept[]): Promise<Recommendation[]> {
  const userId = await getAnonymousUserId();
  const res = await fetch(`${API_BASE_URL}/api/build-recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ concepts, user_id: userId }),
  });
  throwForStatus(res, 'build-recommendations');
  const { recommendations } = await res.json();
  return recommendations;
}

// Recommendations aren't persisted anywhere, so there's no
// recommendation_id to send — instead this sends back the image_urls the
// liked card already has in hand, and the backend re-embeds each one via
// CLIP and folds it into the running-average preference vector.
export async function sendRecommendationFeedback(imageUrls: string[]): Promise<void> {
  const userId = await getAnonymousUserId();
  const res = await fetch(`${API_BASE_URL}/api/recommendation-feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, image_urls: imageUrls }),
  });
  throwForStatus(res, 'recommendation-feedback');
}
