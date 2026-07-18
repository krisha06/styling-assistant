import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { seedOnboardingForDev, uploadOnboardingPhotos } from '@/services/api';

const SELECTION_LIMIT = 15;
const THUMBNAIL_SIZE = 72;

type Stage = 'picking' | 'preparing' | 'saving';

export default function OnboardingScreen() {
  const [stage, setStage] = useState<Stage>('picking');
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handlePickPhotos() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Permission denied.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: SELECTION_LIMIT,
      quality: 0.8,
    });
    if (pickerResult.canceled) return;

    // The native picker hands back full asset objects for up to 15 photos —
    // processing that (and the thumbnail grid mounting) can take a beat, and
    // with no feedback the screen looks frozen right after picking.
    setStage('preparing');
    setSelected(pickerResult.assets);
    setStage('picking');
  }

  async function finishOnboarding() {
    router.replace('/');
  }

  async function handleContinue() {
    if (selected.length === 0) return;
    setError(null);
    setStage('saving');
    try {
      const { processed } = await uploadOnboardingPhotos(selected.map((asset) => asset.uri));
      if (processed === 0) {
        setError("Couldn't save any of those photos — try again.");
        setStage('picking');
        return;
      }
      await finishOnboarding();
    } catch {
      setError('Something went wrong saving your photos. Try again.');
      setStage('picking');
    }
  }

  async function handleDevSeed() {
    setError(null);
    setStage('saving');
    try {
      await seedOnboardingForDev();
      await finishOnboarding();
    } catch {
      setError('Dev seed failed.');
      setStage('picking');
    }
  }

  if (stage === 'saving') {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
          Saving your style…
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="subtitle">Add outfits you love</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
        15 recommended — your own photos, or ones you&apos;ve saved from Pinterest or elsewhere.
      </ThemedText>

      <Pressable onPress={handlePickPhotos}>
        <ThemedView type="backgroundSelected" style={styles.button}>
          <ThemedText>{selected.length > 0 ? 'Change photos' : 'Choose photos'}</ThemedText>
        </ThemedView>
      </Pressable>

      {selected.length > 0 && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {selected.length} selected
          </ThemedText>
          <View style={styles.thumbnailGrid}>
            {selected.map((asset) => (
              <Image key={asset.assetId ?? asset.uri} source={{ uri: asset.uri }} style={styles.thumbnail} contentFit="cover" />
            ))}
          </View>
          <Pressable onPress={handleContinue}>
            <ThemedView type="backgroundElement" style={styles.button}>
              <ThemedText>Continue</ThemedText>
            </ThemedView>
          </Pressable>
        </>
      )}

      {error && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
          {error}
        </ThemedText>
      )}

      {__DEV__ && (
        <Pressable onPress={handleDevSeed}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.devLink}>
            [dev] Auto-fill 15 random outfits
          </ThemedText>
        </Pressable>
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
    paddingVertical: Spacing.six,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    marginBottom: Spacing.three,
  },
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  status: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  thumbnailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: Spacing.one,
  },
  devLink: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
});
