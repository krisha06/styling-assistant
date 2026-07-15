import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { AGE_RANGES, PREFER_NOT_TO_SAY } from '@/data/age-ranges';
import { SHOW_ME_A_MIX, STYLE_BUCKETS } from '@/data/style-buckets';
import { getOnboardingDeck, postOnboardingSwipe, type OnboardingDeckItem } from '@/services/api';
import { setHasOnboarded } from '@/services/onboarding-status';

const TARGET_DECK_SIZE = 16;
const MAX_MATCHED_CARDS = 12;
const MAX_SELECTED_BUCKETS = 2;

// Images are hotlinked from external sites — some link rot over time is
// inevitable (dead links, hotlink protection). Falling back to a labeled
// placeholder on load failure avoids a jarring blank/black card.
function SwipeCard({ card }: { card: OnboardingDeckItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {failed ? (
        <ThemedView type="backgroundElement" style={styles.cardFallback}>
          <ThemedText type="small" themeColor="textSecondary">
            Image unavailable
          </ThemedText>
        </ThemedView>
      ) : (
        <Image
          source={{ uri: card.image_url }}
          style={styles.cardImage}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      )}
    </ThemedView>
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Cards matching both the selected style buckets and the selected age tag
// score highest, cards matching just one score next, and the rest backfill
// up to the target size for variety — never a fully monotonous deck even
// when a narrow bucket/age combo is picked.
function buildSwipeDeck(
  pool: OnboardingDeckItem[],
  selectedBuckets: string[],
  ageTag: string | null,
): OnboardingDeckItem[] {
  const selectedStyleTags = new Set(selectedBuckets.flatMap((bucket) => STYLE_BUCKETS[bucket] ?? []));

  if (selectedStyleTags.size === 0 && !ageTag) {
    return shuffle(pool).slice(0, TARGET_DECK_SIZE);
  }

  const scored = pool.map((card) => {
    const styleMatch = card.tags.some((tag) => selectedStyleTags.has(tag));
    const ageMatch = ageTag ? card.tags.includes(ageTag) : false;
    return { card, score: (styleMatch ? 1 : 0) + (ageMatch ? 1 : 0) };
  });

  const bestFirst = [2, 1].flatMap((score) => shuffle(scored.filter((s) => s.score === score).map((s) => s.card)));
  const primary = bestFirst.slice(0, MAX_MATCHED_CARDS);
  const primaryIds = new Set(primary.map((card) => card.image_id));
  const rest = shuffle(pool.filter((card) => !primaryIds.has(card.image_id)));
  const backfill = rest.slice(0, Math.max(0, TARGET_DECK_SIZE - primary.length));

  return shuffle([...primary, ...backfill]);
}

export default function OnboardingScreen() {
  const [stage, setStage] = useState<'select-style' | 'select-age' | 'swiping'>('select-style');
  const [pool, setPool] = useState<OnboardingDeckItem[] | null>(null);
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([]);
  const [deck, setDeck] = useState<OnboardingDeckItem[] | null>(null);
  const swipedCount = useRef(0);
  const finished = useRef(false);
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    getOnboardingDeck().then(setPool);
  }, []);

  function toggleBucket(bucket: string) {
    setSelectedBuckets((current) => {
      if (current.includes(bucket)) return current.filter((b) => b !== bucket);
      if (current.length >= MAX_SELECTED_BUCKETS) return current;
      return [...current, bucket];
    });
  }

  function startSwiping(ageTag: string | null) {
    if (!pool) return;
    setDeck(buildSwipeDeck(pool, selectedBuckets, ageTag));
    setStage('swiping');
  }

  function handleHeaderLayout(event: LayoutChangeEvent) {
    setHeaderHeight(event.nativeEvent.layout.height);
  }

  // react-native-deck-swiper's own onSwipedAll completion has a timing race
  // right at the last card — sometimes it fires late or not at all, leaving
  // an empty stack visible instead of navigating away. Detecting the last
  // swipe ourselves and finishing immediately (guarded so onSwipedAll can't
  // double-fire) makes the transition reliable.
  function handleSwipe(cardIndex: number, liked: boolean) {
    const card = deck?.[cardIndex];
    if (!card) return;
    postOnboardingSwipe(card.image_id, liked);
    swipedCount.current += 1;
    if (deck && cardIndex === deck.length - 1) {
      finishOnboarding();
    }
  }

  async function finishOnboarding() {
    if (finished.current) return;
    finished.current = true;
    await setHasOnboarded();
    router.replace('/');
  }

  if (!pool) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (stage === 'select-style') {
    return (
      <ThemedView style={styles.pickerContainer}>
        <ThemedText type="subtitle">Find your style</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.pickerSubtitle}>
          Pick up to two looks you gravitate toward — we&apos;ll start you off there.
        </ThemedText>

        {Object.keys(STYLE_BUCKETS).map((bucket) => {
          const selected = selectedBuckets.includes(bucket);
          return (
            <Pressable key={bucket} onPress={() => toggleBucket(bucket)}>
              <ThemedView type={selected ? 'backgroundSelected' : 'backgroundElement'} style={styles.bucketChip}>
                <ThemedText>{bucket}</ThemedText>
              </ThemedView>
            </Pressable>
          );
        })}

        {selectedBuckets.length > 0 && (
          <Pressable onPress={() => setStage('select-age')}>
            <ThemedView type="backgroundSelected" style={styles.continueButton}>
              <ThemedText>Continue</ThemedText>
            </ThemedView>
          </Pressable>
        )}

        <Pressable onPress={() => setStage('select-age')}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.skipLink}>
            {SHOW_ME_A_MIX}
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (stage === 'select-age') {
    return (
      <ThemedView style={styles.pickerContainer}>
        <ThemedText type="subtitle">What&apos;s your age range?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.pickerSubtitle}>
          Helps us show looks on people closer to your own age.
        </ThemedText>

        {Object.entries(AGE_RANGES).map(([label, tag]) => (
          <Pressable key={tag} onPress={() => startSwiping(tag)}>
            <ThemedView type="backgroundElement" style={styles.bucketChip}>
              <ThemedText>{label}</ThemedText>
            </ThemedView>
          </Pressable>
        ))}

        <Pressable onPress={() => startSwiping(null)}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.skipLink}>
            {PREFER_NOT_TO_SAY}
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
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
        renderCard={(card) => (card ? <SwipeCard card={card} /> : null)}
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
  pickerContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  pickerSubtitle: {
    marginBottom: Spacing.three,
  },
  bucketChip: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  continueButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  skipLink: {
    textAlign: 'center',
    marginTop: Spacing.three,
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
  cardFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
