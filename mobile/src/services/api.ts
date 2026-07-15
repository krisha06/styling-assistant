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
