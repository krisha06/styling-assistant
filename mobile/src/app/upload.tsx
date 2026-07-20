import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

import { RecommendationCard } from '@/components/recommendation-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  analyzeItem,
  buildRecommendations,
  generateConcepts,
  OverloadedError,
  RateLimitedError,
  type Recommendation,
  sendRecommendationFeedback,
} from '@/services/api';

type Stage = 'idle' | 'analyzing' | 'generating-concepts' | 'finding-references' | 'done';

// Scope boundary: the dedicated Recommendations screen (section 6, screen
// 4) doesn't exist yet — this screen covers all three loading stages
// described there (Identifying the piece, Generating outfit ideas,
// Finding references) and shows the ranked recommendations directly as a
// temporary confirmation, not a real navigation into a dedicated screen.
export default function UploadScreen() {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [likedConcepts, setLikedConcepts] = useState<Set<string>>(new Set());

  function handleLike(rec: Recommendation) {
    if (likedConcepts.has(rec.id)) return;
    setLikedConcepts((prev) => new Set(prev).add(rec.id));
    sendRecommendationFeedback(rec.id).catch(() => {
      // Best-effort — the heart already shows liked; not worth an error UI for this.
    });
  }

  async function handlePick(fromCamera: boolean) {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Permission denied.');
      return;
    }

    const pickerResult = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });

    if (pickerResult.canceled) return;

    const uri = pickerResult.assets[0].uri;
    setRecommendations(null);
    setLikedConcepts(new Set());
    setStage('analyzing');
    try {
      const { item_description } = await analyzeItem(uri);
      setStage('generating-concepts');
      const concepts = await generateConcepts(item_description);
      setStage('finding-references');
      const result = await buildRecommendations(concepts);
      setRecommendations(result);
      setStage('done');
    } catch (e) {
      if (e instanceof RateLimitedError) {
        setError("We're getting a lot of requests right now — please try again in a few minutes.");
      } else if (e instanceof OverloadedError) {
        setError('Sorry for the inconvenience — the description service is temporarily overloaded. Please try again later.');
      } else {
        setError('Something went wrong analyzing that photo. Try again.');
      }
      setStage('idle');
    }
  }

  if (stage === 'analyzing' || stage === 'generating-concepts' || stage === 'finding-references') {
    const statusText =
      stage === 'analyzing'
        ? 'Identifying the piece…'
        : stage === 'generating-concepts'
          ? 'Generating outfit ideas…'
          : 'Finding references…';
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
        <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
          {statusText}
        </ThemedText>
      </ThemedView>
    );
  }

  if (stage === 'done' && recommendations) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedText type="subtitle">Outfit ideas</ThemedText>
        {recommendations.map((rec) => (
          <RecommendationCard
            key={rec.id}
            recommendation={rec}
            liked={likedConcepts.has(rec.id)}
            onLike={() => handleLike(rec)}
          />
        ))}
        <Pressable onPress={() => router.replace('/')}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.doneLink}>
            Done
          </ThemedText>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Upload a clothing item</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
        Take a photo or pick one from your library.
      </ThemedText>

      <Pressable onPress={() => handlePick(true)}>
        <ThemedView type="backgroundSelected" style={styles.button}>
          <ThemedText>Take a photo</ThemedText>
        </ThemedView>
      </Pressable>

      <Pressable onPress={() => handlePick(false)}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText>Choose from library</ThemedText>
        </ThemedView>
      </Pressable>

      {error && (
        <ThemedText type="small" themeColor="error" style={styles.status}>
          {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  scrollContainer: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
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
  doneLink: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
