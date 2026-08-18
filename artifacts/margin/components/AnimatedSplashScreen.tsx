import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from "react-native";
import * as SvgModule from "react-native-svg";

const SvgComp = (SvgModule.default ?? SvgModule.Svg ?? SvgModule) as any;
const PathComp = (SvgModule.Path ?? (SvgModule as any).default?.Path) as any;
const CircleComp = (SvgModule.Circle ?? (SvgModule as any).default?.Circle) as any;
const AnimatedPath = Animated.createAnimatedComponent(PathComp);
const AnimatedCircle = Animated.createAnimatedComponent(CircleComp);

interface AnimatedSplashScreenProps {
  onAnimationFinish?: () => void;
}

export function AnimatedSplashScreen({ onAnimationFinish }: AnimatedSplashScreenProps) {
  const [isDone, setIsDone] = useState(false);

  // Overall screen opacity for exit transition
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenScale = useRef(new Animated.Value(1)).current;

  // Quill animation values
  const quillProgress = useRef(new Animated.Value(0)).current;
  const quillOpacity = useRef(new Animated.Value(0)).current;
  const quillScale = useRef(new Animated.Value(0.92)).current;

  // Letter stroke progress values (0 = not drawn, 1 = fully drawn)
  const animM = useRef(new Animated.Value(0)).current;
  const animA = useRef(new Animated.Value(0)).current;
  const animR = useRef(new Animated.Value(0)).current;
  const animG = useRef(new Animated.Value(0)).current;
  const animI = useRef(new Animated.Value(0)).current;
  const animDot = useRef(new Animated.Value(0)).current;
  const animN = useRef(new Animated.Value(0)).current;

  // Subtitle / tagline fade
  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sequence of animations
    Animated.sequence([
      // 1. Quill enters smoothly (350ms)
      Animated.parallel([
        Animated.timing(quillOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(quillScale, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
          easing: Easing.out(Easing.back(1.2)),
        }),
        Animated.timing(quillProgress, {
          toValue: 1,
          duration: 400,
          useNativeDriver: false,
          easing: Easing.out(Easing.quad),
        }),
      ]),

      // 2. Letters draw sequentially (Fast pen strokes: ~180-240ms each)
      Animated.timing(animM, {
        toValue: 1,
        duration: 260,
        useNativeDriver: false,
        easing: Easing.inOut(Easing.quad),
      }),
      Animated.timing(animA, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
        easing: Easing.inOut(Easing.quad),
      }),
      Animated.timing(animR, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
        easing: Easing.inOut(Easing.quad),
      }),
      Animated.timing(animG, {
        toValue: 1,
        duration: 220,
        useNativeDriver: false,
        easing: Easing.inOut(Easing.quad),
      }),
      Animated.parallel([
        Animated.timing(animI, {
          toValue: 1,
          duration: 160,
          useNativeDriver: false,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.sequence([
          Animated.delay(120),
          Animated.timing(animDot, {
            toValue: 1,
            duration: 140,
            useNativeDriver: true,
            easing: Easing.out(Easing.back(2)),
          }),
        ]),
      ]),
      Animated.timing(animN, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
        easing: Easing.inOut(Easing.quad),
      }),

      // 3. Subtitle / tagline reveals
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),

      // 4. Linger briefly for aesthetic impact (~500ms)
      Animated.delay(500),

      // 5. Elegant exit fade & subtle scale
      Animated.parallel([
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
      ]),
    ]).start(() => {
      setIsDone(true);
      if (onAnimationFinish) {
        onAnimationFinish();
      }
    });
  }, [
    animA,
    animDot,
    animG,
    animI,
    animM,
    animN,
    animR,
    onAnimationFinish,
    quillOpacity,
    quillProgress,
    quillScale,
    screenOpacity,
    screenScale,
    subtitleOpacity,
  ]);

  if (isDone) {
    return null;
  }

  // Stroke dashoffset helper
  const strokeOffset = (anim: Animated.Value, length: number) => {
    return anim.interpolate({
      inputRange: [0, 1],
      outputRange: [length, 0],
    });
  };

  const INK_COLOR = "#332c25";
  const ACCENT_SAGE = "#63805d";
  const PAPER_BG = "#faf7f2";

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
        {/* ── 1. Ink Quill Feather Emblem ── */}
        <Animated.View
          style={[
            styles.quillContainer,
            {
              opacity: quillOpacity,
              transform: [{ scale: quillScale }],
            },
          ]}
        >
          <SvgComp width={72} height={72} viewBox="0 0 100 100" fill="none">
            {/* Soft subtle glow / shadow */}
            <PathComp
              d="M32 82 C38 68 50 42 78 18 C72 26 64 33 60 41 C54 39 48 42 45 47 C41 46 37 49 35 55 C32 60 30 68 32 82 Z"
              fill={ACCENT_SAGE}
              opacity={0.15}
              transform="translate(1, 2)"
            />
            {/* Main Quill Body & Vane */}
            <PathComp
              d="M32 82 C38 68 50 42 78 18 C72 26 64 33 60 41 C54 39 48 42 45 47 C41 46 37 49 35 55 C32 60 30 68 32 82 Z"
              fill={ACCENT_SAGE}
            />
            {/* Central Quill Shaft / Spine */}
            <AnimatedPath
              d="M32 82 L78 18"
              stroke={PAPER_BG}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={[85, 85]}
              strokeDashoffset={strokeOffset(quillProgress, 85) as any}
            />
            {/* Pen Nib Tip */}
            <PathComp
              d="M30 84 L33 79 L27 81 Z"
              fill={INK_COLOR}
            />
          </SvgComp>
        </Animated.View>

        {/* ── 2. Calligraphic Pen-Drawn Wordmark "Margin" ── */}
        <View style={styles.svgWrapper}>
          <SvgComp width={300} height={90} viewBox="0 0 300 90" fill="none">
            {/* Letter 'M' (Length ~260) */}
            <AnimatedPath
              d="M 28 65 L 28 25 M 24 25 L 34 25 M 28 25 L 48 65 L 68 25 M 68 25 L 68 65 M 63 65 L 73 65 M 23 65 L 33 65"
              stroke={INK_COLOR}
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={[280, 280]}
              strokeDashoffset={strokeOffset(animM, 280) as any}
            />

            {/* Letter 'a' (Length ~170) */}
            <AnimatedPath
              d="M 103 44 C 94 36 82 40 82 52 C 82 62 92 66 102 61 L 102 38 M 102 42 L 102 65 M 99 65 L 105 65"
              stroke={INK_COLOR}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={[190, 190]}
              strokeDashoffset={strokeOffset(animA, 190) as any}
            />

            {/* Letter 'r' (Length ~110) */}
            <AnimatedPath
              d="M 119 65 L 119 38 M 115 38 L 123 38 M 119 46 C 122 40 128 37 136 38"
              stroke={INK_COLOR}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={[130, 130]}
              strokeDashoffset={strokeOffset(animR, 130) as any}
            />

            {/* Letter 'g' (Length ~230) */}
            <AnimatedPath
              d="M 166 43 C 158 36 146 39 146 50 C 146 60 156 65 166 59 L 166 38 M 166 42 L 166 69 C 166 79 157 84 147 80"
              stroke={INK_COLOR}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={[240, 240]}
              strokeDashoffset={strokeOffset(animG, 240) as any}
            />

            {/* Letter 'i' (Stem Length ~70) */}
            <AnimatedPath
              d="M 183 38 L 183 65 M 179 38 L 187 38 M 179 65 L 187 65"
              stroke={INK_COLOR}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={[90, 90]}
              strokeDashoffset={strokeOffset(animI, 90) as any}
            />
            {/* Tittle Dot for 'i' */}
            <AnimatedCircle
              cx="183"
              cy="28"
              r="2.4"
              fill={ACCENT_SAGE}
              opacity={animDot as any}
            />

            {/* Letter 'n' (Length ~180) */}
            <AnimatedPath
              d="M 203 65 L 203 38 M 199 38 L 207 38 M 203 46 C 209 38 221 37 225 45 L 225 65 M 221 65 L 229 65"
              stroke={INK_COLOR}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={[200, 200]}
              strokeDashoffset={strokeOffset(animN, 200) as any}
            />
          </SvgComp>
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
          <Animated.Text style={styles.subtitleText}>
            A Journal for Thought
          </Animated.Text>
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
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  svgWrapper: {
    width: 300,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
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
