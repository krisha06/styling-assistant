import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { resetAnonymousUserId } from '@/services/anonymous-user';
import { getHasOnboarded, resetHasOnboarded } from '@/services/onboarding-status';

export default function HomeScreen() {
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    getHasOnboarded().then(setHasOnboarded);
  }, []);

  if (hasOnboarded === null) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!hasOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two }}>
      <ThemedText type="subtitle">Onboarding complete</ThemedText>
      <Pressable onPress={() => router.push('/upload')} style={{ marginTop: Spacing.two }}>
        <ThemedView type="backgroundSelected" style={{ borderRadius: Spacing.three, paddingVertical: Spacing.three, paddingHorizontal: Spacing.four }}>
          <ThemedText>Upload a clothing item</ThemedText>
        </ThemedView>
      </Pressable>
      {__DEV__ && (
        <Pressable
          onPress={async () => {
            await resetHasOnboarded();
            await resetAnonymousUserId();
            setHasOnboarded(false);
          }}
          style={{ marginTop: Spacing.four }}>
          <ThemedText type="small" themeColor="textSecondary">
            [dev] Reset onboarding (new test user)
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}
