import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signIn, signUp } from '@/services/auth';
import { getOnboardingStatus } from '@/services/api';

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email || !password) {
      setError('Enter an email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      const hasOnboarded = await getOnboardingStatus();
      router.replace(hasOnboarded ? '/' : '/onboarding');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="subtitle">{mode === 'signup' ? 'Sign up' : 'Log in'}</ThemedText>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        secureTextEntry
        style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />

      <Pressable onPress={handleSubmit} disabled={loading}>
        <ThemedView type="backgroundSelected" style={styles.button}>
          {loading ? <ActivityIndicator /> : <ThemedText>{mode === 'signup' ? 'Create account' : 'Log in'}</ThemedText>}
        </ThemedView>
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.toggleLink}>
          {mode === 'signup' ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
        </ThemedText>
      </Pressable>

      {error && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
          {error}
        </ThemedText>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  input: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  toggleLink: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  status: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
});
