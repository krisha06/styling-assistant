import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getHasOnboarded } from '@/services/onboarding-status';

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

  // Placeholder until the upload screen (CLAUDE.md section 6, screen 2) is built.
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two }}>
      <ThemedText type="subtitle">Onboarding complete</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Upload screen goes here next
      </ThemedText>
    </ThemedView>
  );
}
