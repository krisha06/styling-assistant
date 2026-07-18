import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

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
  type RecommendationImage,
  sendRecommendationFeedback,
} from '@/services/api';

const LIKE_COLOR = '#E0455F';

// No explicit "pass" action — a pass is just not tapping the heart, which
// already matches how the preference vector works (only likes fold in).
// Once liked, stays liked — the running average isn't reversible, so
// there's no undo. Fires the feedback call best-effort: a failed network
// call isn't worth surfacing an error for a "like" tap.
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

type Stage = 'idle' | 'analyzing' | 'generating-concepts' | 'finding-references' | 'done';

const CAROUSEL_HEIGHT = 260;

// Reference images are hotlinked from arbitrary external sites, same as the
// onboarding deck — a failed load shows a labeled placeholder instead of a
// blank card, same pattern as onboarding.tsx's SwipeCard. Each image is a
// specific item (e.g. "white jeans"), not the full outfit, so it gets a
// caption naming what it is — full width now, so the caption isn't clipped.
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
// pagination showing position — replaces the earlier wrapped grid of small
// thumbnails, whose captions were getting clipped at that size.
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
    if (likedConcepts.has(rec.vibe_label)) return;
    setLikedConcepts((prev) => new Set(prev).add(rec.vibe_label));
    sendRecommendationFeedback(rec.images.map((image) => image.image_url)).catch(() => {
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
        setError('The description service is temporarily overloaded — please try again.');
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
          <ThemedView key={rec.vibe_label} type="backgroundElement" style={styles.resultCard}>
            <View style={styles.cardHeader}>
              <ThemedText type="smallBold">{rec.vibe_label}</ThemedText>
              <LikeButton liked={likedConcepts.has(rec.vibe_label)} onPress={() => handleLike(rec)} />
            </View>
            <ThemedText>{rec.explanation}</ThemedText>
            <ImageCarousel images={rec.images} />
          </ThemedView>
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
        <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
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
  doneLink: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
