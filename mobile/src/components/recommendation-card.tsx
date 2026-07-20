import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Recommendation, RecommendationImage } from '@/services/api';

const LIKE_COLOR = '#E0455F';
const CAROUSEL_HEIGHT = 260;

// No explicit "pass" action — a pass is just not tapping the heart, which
// already matches how the preference vector works (only likes fold in).
// Once liked, stays liked — the running average isn't reversible, so
// there's no undo.
function LikeButton({ liked, onPress }: { liked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <SymbolView
        name={liked ? 'heart.fill' : 'heart'}
        size={22}
        tintColor={liked ? LIKE_COLOR : undefined}
        fallback={
          <ThemedText type="subtitle" style={liked && { color: LIKE_COLOR }}>
            {liked ? '♥' : '♡'}
          </ThemedText>
        }
      />
    </Pressable>
  );
}

// Reference images are hotlinked from arbitrary external sites, same as the
// onboarding deck — a failed load shows a labeled placeholder instead of a
// blank card. Each image is a specific item (e.g. "white jeans"), not the
// full outfit, so it gets a caption naming what it is.
function ReferenceImage({ image, width }: { image: RecommendationImage; width: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.imagePage, { width }]}>
      {failed ? (
        <ThemedView type="backgroundSelected" style={styles.imageFallback}>
          <ThemedText type="small" themeColor="textSecondary">
            Image unavailable
          </ThemedText>
        </ThemedView>
      ) : (
        <Image
          source={{ uri: image.image_url }}
          style={styles.image}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      )}
      <ThemedText type="small" themeColor="textSecondary" style={styles.imageCaption}>
        {image.item}
      </ThemedText>
    </View>
  );
}

// A swipeable, one-image-at-a-time carousel per concept, with dot
// pagination showing position.
function ImageCarousel({ images }: { images: RecommendationImage[] }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width === 0) return;
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && (
        <FlatList
          data={images}
          keyExtractor={(image) => image.image_url}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          renderItem={({ item }) => <ReferenceImage image={item} width={width} />}
        />
      )}
      {images.length > 1 && (
        <View style={styles.dotsRow}>
          {images.map((image, i) => (
            <ThemedView
              key={image.image_url}
              type={i === index ? 'backgroundSelected' : 'backgroundElement'}
              style={styles.dot}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function RecommendationCard({
  recommendation,
  liked,
  onLike,
}: {
  recommendation: Recommendation;
  liked: boolean;
  onLike: () => void;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.resultCard}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold">{recommendation.vibe_label}</ThemedText>
        <LikeButton liked={liked} onPress={onLike} />
      </View>
      <ThemedText>{recommendation.explanation}</ThemedText>
      <ImageCarousel images={recommendation.images} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  resultCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imagePage: {
    gap: Spacing.one,
  },
  image: {
    width: '100%',
    height: CAROUSEL_HEIGHT,
    borderRadius: Spacing.two,
  },
  imageFallback: {
    width: '100%',
    height: CAROUSEL_HEIGHT,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageCaption: {
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
