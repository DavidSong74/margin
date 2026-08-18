import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

interface AnimatedSplashScreenV2Props {
  onAnimationFinish?: () => void;
}

interface LetterAnim {
  opacity: Animated.Value;
  translateY: Animated.Value;
}

const LETTERS = ["M", "a", "r", "g", "i", "n"] as const;
const INK_COLOR = "#332c25";
const ACCENT_SAGE = "#63805d";
const PAPER_BG = "#faf7f2";

// React 19 icon component compatibility
const FeatherIcon = Feather as unknown as React.ComponentType<{
  name: string;
  size: number;
  color: string;
}>;

export function AnimatedSplashScreenV2({ onAnimationFinish }: AnimatedSplashScreenV2Props) {
  const [isDone, setIsDone] = useState(false);

  // Overall screen opacity and scale for exit transition
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenScale = useRef(new Animated.Value(1)).current;

  // Quill animation values
  const quillOpacity = useRef(new Animated.Value(0)).current;
  const quillTranslateY = useRef(new Animated.Value(-20)).current;

  // Letter animations (M, a, r, g, i, n)
  const letterAnimValues = useRef<LetterAnim[]>(
    LETTERS.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(15),
    }))
  ).current;

  // Subtitle fade
  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Quill enters
    const quillEnter = Animated.parallel([
      Animated.timing(quillOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(quillTranslateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.5)),
      }),
    ]);

    // 2. Staggered letters
    const lettersEnter = letterAnimValues.map((anim, index) => {
      return Animated.sequence([
        Animated.delay(index * 90), // Stagger delay
        Animated.parallel([
          Animated.timing(anim.opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(anim.translateY, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
            easing: Easing.out(Easing.back(1.2)),
          }),
        ]),
      ]);
    });

    // 3. Subtitle enters
    const subtitleEnter = Animated.timing(subtitleOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
      easing: Easing.out(Easing.quad),
    });

    // 4. Exit transition
    const exitTransition = Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
      Animated.timing(screenScale, {
        toValue: 1.04,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
    ]);

    Animated.sequence([
      quillEnter,
      Animated.parallel(lettersEnter),
      subtitleEnter,
      Animated.delay(600), // Linger
      exitTransition,
    ]).start(() => {
      setIsDone(true);
      if (onAnimationFinish) {
        onAnimationFinish();
      }
    });
  }, [letterAnimValues, onAnimationFinish, quillOpacity, quillTranslateY, screenOpacity, screenScale, subtitleOpacity]);

  if (isDone) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: PAPER_BG,
          opacity: screenOpacity,
          transform: [{ scale: screenScale }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.content}>
        {/* ── 1. Quill Emblem ── */}
        <Animated.View
          style={[
            styles.quillContainer,
            {
              opacity: quillOpacity,
              transform: [{ translateY: quillTranslateY }],
            },
          ]}
        >
          <FeatherIcon name="feather" size={56} color={ACCENT_SAGE} />
        </Animated.View>

        {/* ── 2. Elegant Typography Wordmark ── */}
        <View style={styles.wordmarkContainer}>
          {LETTERS.map((letter, index) => {
            const anim = letterAnimValues[index];
            if (!anim) return null;
            return (
              <Animated.Text
                key={letter + index}
                style={[
                  styles.letter,
                  {
                    color: INK_COLOR,
                    opacity: anim.opacity,
                    transform: [{ translateY: anim.translateY }],
                  },
                ]}
              >
                {letter}
              </Animated.Text>
            );
          })}
        </View>

        {/* ── 3. Minimalist Editorial Subtitle ── */}
        <Animated.View
          style={[
            styles.subtitleContainer,
            {
              opacity: subtitleOpacity,
            },
          ]}
        >
          <View style={styles.subRule} />
          <Text style={styles.subtitleText}>A Journal for Thought</Text>
          <View style={styles.subRule} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const { width, height } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    width,
    height,
    zIndex: 99999,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  quillContainer: {
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmarkContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    height: 80, // Fixed height to prevent layout shifts
  },
  letter: {
    fontFamily: "PlayfairDisplay_600SemiBold",
    fontSize: 64,
    lineHeight: 80,
  },
  subtitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 12,
  },
  subRule: {
    width: 24,
    height: 1,
    backgroundColor: "rgba(100, 85, 72, 0.25)",
  },
  subtitleText: {
    fontSize: 12,
    letterSpacing: 2.8,
    textTransform: "uppercase",
    color: "#8c7d72",
    fontFamily: "PlayfairDisplay_400Regular",
  },
});
