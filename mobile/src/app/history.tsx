import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

import { RecommendationCard } from '@/components/recommendation-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  getRecommendationHistory,
  type RecommendationHistoryItem,
  sendRecommendationFeedback,
} from '@/services/api';

export default function HistoryScreen() {
  const [items, setItems] = useState<RecommendationHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Liking here follows the same "once liked, stays liked" rule as
  // upload.tsx — local overrides just let the heart flip instantly without
  // waiting on a refetch.
  const [likedOverrides, setLikedOverrides] = useState<Set<string>>(new Set());

  function load() {
    setError(null);
    setItems(null);
    getRecommendationHistory()
      .then(setItems)
      .catch(() => setError('Could not load past recommendations.'));
  }

  useEffect(load, []);

  function handleLike(id: string) {
    if (likedOverrides.has(id)) return;
    setLikedOverrides((prev) => new Set(prev).add(id));
    sendRecommendationFeedback(id).catch(() => {
      // Best-effort — the heart already shows liked; not worth an error UI for this.
    });
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="small" themeColor="error" style={styles.errorText}>
          {error}
        </ThemedText>
        <Pressable onPress={load}>
          <ThemedView type="backgroundElement" style={styles.retryButton}>
            <ThemedText>Try again</ThemedText>
          </ThemedView>
        </Pressable>
      </ThemedView>
    );
  }

  if (!items) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedText type="subtitle">Past recommendations</ThemedText>
      {items.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nothing here yet — upload an item to get some outfit ideas.
        </ThemedText>
      ) : (
        items.map((item) => (
          <RecommendationCard
            key={item.id}
            recommendation={item}
            liked={item.liked || likedOverrides.has(item.id)}
            onLike={() => handleLike(item.id)}
          />
        ))
      )}
      <Pressable onPress={() => router.back()}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.doneLink}>
          Done
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  errorText: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  retryButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  scrollContainer: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  doneLink: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
