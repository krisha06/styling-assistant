import AsyncStorage from '@react-native-async-storage/async-storage';

// Local-only "seen onboarding" flag for Phase 1 (no persistent user account
// yet — see CLAUDE.md section 4, Phase 2 adds real accounts). This gates
// the onboarding swipe screen to first launch only, per section 6.
const HAS_ONBOARDED_KEY = 'hasOnboarded';

export async function getHasOnboarded(): Promise<boolean> {
  const value = await AsyncStorage.getItem(HAS_ONBOARDED_KEY);
  return value === 'true';
}

export async function setHasOnboarded(): Promise<void> {
  await AsyncStorage.setItem(HAS_ONBOARDED_KEY, 'true');
}

// Dev-only convenience for re-testing the onboarding flow — see the reset
// button on the placeholder home screen (index.tsx), guarded by __DEV__.
export async function resetHasOnboarded(): Promise<void> {
  await AsyncStorage.removeItem(HAS_ONBOARDED_KEY);
}
