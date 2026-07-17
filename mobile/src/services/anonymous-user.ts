import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// Local-only stand-in for a real user id until Phase 1 anonymous Supabase
// auth (or Phase 2 accounts) exists — see CLAUDE.md section 4. No auth
// service involved; replace when real auth lands.
//
// Uses expo-crypto's randomUUID, not the bare `crypto.randomUUID()` global —
// this RN/Hermes setup doesn't polyfill Web Crypto, so the bare global
// throws at runtime.
const ANONYMOUS_USER_ID_KEY = 'anonymousUserId';

export async function getAnonymousUserId(): Promise<string> {
  let id = await AsyncStorage.getItem(ANONYMOUS_USER_ID_KEY);
  if (!id) {
    id = `anon-${Crypto.randomUUID()}`;
    await AsyncStorage.setItem(ANONYMOUS_USER_ID_KEY, id);
  }
  return id;
}

// Dev-only convenience so "[dev] Reset onboarding" (index.tsx) can give a
// true fresh-user test — without this, the same id (and its Supabase
// preference vector) persists across onboarding resets by design, since
// this id is meant to survive app restarts for real users (CLAUDE.md
// section 5). A fresh random id is generated on the next getAnonymousUserId()
// call; the old id's Supabase row is left orphaned (harmless test data).
export async function resetAnonymousUserId(): Promise<void> {
  await AsyncStorage.removeItem(ANONYMOUS_USER_ID_KEY);
}
