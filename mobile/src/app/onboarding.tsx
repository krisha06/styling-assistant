import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { OnboardingDeckItem } from '@/data/onboarding-deck';
import { getOnboardingDeck, postOnboardingSwipe } from '@/services/api';
import { setHasOnboarded } from '@/services/onboarding-status';

export default function OnboardingScreen() {
  const [deck, setDeck] = useState<OnboardingDeckItem[] | null>(null);
  const swipedCount = useRef(0);
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    getOnboardingDeck().then(setDeck);
  }, []);

  function handleHeaderLayout(event: LayoutChangeEvent) {
    setHeaderHeight(event.nativeEvent.layout.height);
  }

  function handleSwipe(cardIndex: number, liked: boolean) {
    const card = deck?.[cardIndex];
    if (!card) return;
    postOnboardingSwipe(card.image_id, liked);
    swipedCount.current += 1;
  }

  async function finishOnboarding() {
    await setHasOnboarded();
    router.replace('/');
  }

  if (!deck) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  // react-native-deck-swiper sizes cards off the full device window height,
  // not off its parent's layout — so the header is rendered as an absolute
  // overlay (measured via onLayout) rather than a flex sibling, and fed to
  // the swiper via marginTop/marginBottom so the card stack accounts for it
  // instead of overflowing past the bottom of the screen.
  return (
    <ThemedView style={styles.container}>
      <Swiper
        // react-native-deck-swiper's shouldComponentUpdate ignores changes to
        // marginTop/marginBottom, so once the real header height is measured
        // via onLayout, force a remount to pick up the corrected margin
        // instead of silently keeping the stale (too-small) initial value.
        key={headerHeight}
        cards={deck}
        keyExtractor={(card) => card.image_id}
        renderCard={(card) =>
          card ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <Image source={{ uri: card.image_url }} style={styles.cardImage} contentFit="cover" />
            </ThemedView>
          ) : null
        }
        onSwipedLeft={(cardIndex) => handleSwipe(cardIndex, false)}
        onSwipedRight={(cardIndex) => handleSwipe(cardIndex, true)}
        onSwipedAll={finishOnboarding}
        stackSize={3}
        backgroundColor="transparent"
        cardVerticalMargin={Spacing.two}
        marginTop={headerHeight + Spacing.three}
        marginBottom={insets.bottom + Spacing.three}
        overlayLabels={{
          left: {
            title: 'PASS',
            style: {
              label: { color: '#E0455F', fontSize: 28, fontWeight: '700' },
              wrapper: { flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-start', marginTop: 30, marginLeft: -30 },
            },
          },
          right: {
            title: 'LIKE',
            style: {
              label: { color: '#3FB27F', fontSize: 28, fontWeight: '700' },
              wrapper: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', marginTop: 30, marginLeft: 30 },
            },
          },
        }}
      />

      <ThemedView
        style={[styles.header, { paddingTop: insets.top + Spacing.three }]}
        onLayout={handleHeaderLayout}
        pointerEvents="none">
        <ThemedText type="subtitle">Find your style</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Swipe right on looks you like, left on ones you don&apos;t
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  card: {
    flex: 1,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
});
