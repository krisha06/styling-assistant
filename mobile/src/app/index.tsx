import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getOnboardingStatus } from '@/services/api';
import { signOut } from '@/services/auth';
import { supabase } from '@/services/supabase';

type Status = 'loading' | 'no-session' | 'not-onboarded' | 'ready';

export default function HomeScreen() {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    checkStatus();
    // Reacts to sign-out (or sign-in) happening anywhere in the app —
    // e.g. logging out redirects here immediately without a manual navigate.
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      checkStatus();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function checkStatus() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setStatus('no-session');
      return;
    }
    try {
      const hasOnboarded = await getOnboardingStatus();
      setStatus(hasOnboarded ? 'ready' : 'not-onboarded');
    } catch {
      // Expired/invalid token, etc. — treat as signed out rather than getting stuck.
      setStatus('no-session');
    }
  }

  if (status === 'loading') {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (status === 'no-session') {
    return <Redirect href="/login" />;
  }

  if (status === 'not-onboarded') {
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
      <Pressable onPress={() => signOut().catch(() => {})} style={{ marginTop: Spacing.four }}>
        <ThemedText type="small" themeColor="textSecondary">
          Log out
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}
