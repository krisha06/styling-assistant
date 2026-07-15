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
