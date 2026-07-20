import Constants from 'expo-constants';

import { getAccessToken } from '@/services/auth';

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

// Every route now derives user_id from this token server-side
// (backend/services/auth.py) instead of trusting a client-supplied
// user_id field — see CLAUDE.md section 3.
async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  return { Authorization: `Bearer ${token}`, ...extra };
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

export async function getOnboardingStatus(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/onboarding-status`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  throwForStatus(res, 'onboarding-status');
  const { has_onboarded } = await res.json();
  return has_onboarded;
}

export type OnboardingUploadResult = {
  processed: number;
  total: number;
};

// Embeds each photo via CLIP and folds it into the running-average
// preference vector — same fold-in mechanism sendRecommendationFeedback
// already uses, just via uploaded files instead of URLs.
export async function uploadOnboardingPhotos(uris: string[]): Promise<OnboardingUploadResult> {
  const formData = new FormData();
  for (const uri of uris) {
    const filename = uri.split('/').pop() ?? 'photo.jpg';
    const extensionMatch = /\.(\w+)$/.exec(filename);
    const mimeType = extensionMatch ? `image/${extensionMatch[1].toLowerCase()}` : 'image/jpeg';
    formData.append('images', { uri, name: filename, type: mimeType } as unknown as Blob);
  }

  // No explicit Content-Type — RN sets the multipart boundary itself.
  const res = await fetch(`${API_BASE_URL}/api/onboarding-photo-upload`, {
    method: 'POST',
    headers: await authHeaders(),
    body: formData,
  });
  throwForStatus(res, 'onboarding-photo-upload');
  return res.json();
}

// Dev/testing-only shortcut — folds 15 random precomputed pool embeddings
// straight into the vector, skipping the manual photo picker. Not part of
// the production API contract (CLAUDE.md section 3).
export async function seedOnboardingForDev(): Promise<{ processed: number }> {
  const res = await fetch(`${API_BASE_URL}/api/onboarding-dev-seed`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  throwForStatus(res, 'onboarding-dev-seed');
  return res.json();
}

export type AnalyzeItemResult = {
  item_description: string;
  embedding_id: string;
};

export async function analyzeItem(imageUri: string): Promise<AnalyzeItemResult> {
  const filename = imageUri.split('/').pop() ?? 'photo.jpg';
  const extensionMatch = /\.(\w+)$/.exec(filename);
  const mimeType = extensionMatch ? `image/${extensionMatch[1].toLowerCase()}` : 'image/jpeg';

  const formData = new FormData();
  // RN's FormData accepts { uri, name, type } in place of a Blob/File.
  formData.append('image', { uri: imageUri, name: filename, type: mimeType } as unknown as Blob);

  const res = await fetch(`${API_BASE_URL}/api/analyze-item`, {
    method: 'POST',
    headers: await authHeaders(),
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
  const res = await fetch(`${API_BASE_URL}/api/generate-concepts`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ item_description: itemDescription }),
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
  id: string;
  vibe_label: string;
  explanation: string;
  images: RecommendationImage[];
};

export async function buildRecommendations(concepts: Concept[]): Promise<Recommendation[]> {
  const res = await fetch(`${API_BASE_URL}/api/build-recommendations`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ concepts }),
  });
  throwForStatus(res, 'build-recommendations');
  const { recommendations } = await res.json();
  return recommendations;
}

// Recommendations are now persisted server-side, so a like just references
// the row by id — the backend re-embeds its stored images via CLIP and
// folds them into the running-average preference vector.
export async function sendRecommendationFeedback(recommendationId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/recommendation-feedback`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ recommendation_id: recommendationId }),
  });
  throwForStatus(res, 'recommendation-feedback');
}

export type RecommendationHistoryItem = Recommendation & {
  liked: boolean;
  created_at: string;
};

export async function getRecommendationHistory(): Promise<RecommendationHistoryItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/recommendation-history`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  throwForStatus(res, 'recommendation-history');
  const { recommendations } = await res.json();
  return recommendations;
}
