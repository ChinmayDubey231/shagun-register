/**
 * The opening splash ("the shagun lifafa bursts open"), from the design canvas's
 * "00b Opening splash — timing spec". Cold start only.
 *
 *   a sunrise glow spreads across the screen, light rays turn, toran swags drop in at the top,
 *   a rangoli ring and border are drawn → maroon lifafa drops in and bounces → flap flips open
 *   → ₹ coin shoots up flipping in a flash of light, confetti bursts, petals shower the screen
 *   → "Shagun" and "Register" pop in word by word, शगुन रजिस्टर is inked in
 *   → the marigold curtain lifts with a toran hanging from its edge.
 *
 * The full-screen layers are drawn with React Native Skia (splash/SplashSkia.tsx); the lifafa,
 * coin and name are React Native views on top. All of it is drawn from one clock that runs on
 * the UI thread (splash/clock.ts): the app loads on the JavaScript thread meanwhile, and timers
 * there would fire late and hold the lifafa still while the Skia layers moved on.
 *
 * It plays while the database, fonts and saved sign-in load, and lifts at 2.05 s or as soon
 * as the app is ready, whichever is later, so it never adds waiting of its own.
 * The phone's native splash is plain marigold, so this picks up from it without a seam.
 * With Reduce motion on, the open lifafa is shown still for 0.7 s and then fades.
 */
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useBoot } from '@/store/boot';
import { STILL_T, step, useSplashClock } from './splash/clock';
import { loadScene } from './splash/loadScene';
import { SplashScene } from './splash/SplashScene';
import { colors, fonts } from '@/theme';
import { BEAD_SIZE, Bead, useInkWidth, useMotionPreference } from './SignInIntro';

const GROUND = colors.marigold;
const GOLD = '#FFC93C';
const GOLD_DARK = '#D9830B';
const MAROON = colors.sindoor;
const MAROON_DARK = '#5C1322';

const ENV_W = 200;
const ENV_H = 132;
const FLAP_H = 72;
const COIN = 64;
const COIN_RISE = 104;
/** Coin centre, relative to the lifafa's top-left, once it has risen. */
const COIN_X = ENV_W / 2;
const COIN_Y = 4 + COIN / 2 - COIN_RISE;

const LIFT_AT = 2050;
const STILL_FOR = 700;

// Easing curves from the timing spec, as functions the UI thread can run.
const SPRING = Easing.bezierFn(0.34, 1.56, 0.64, 1);
const IN_OUT = Easing.bezierFn(0.65, 0, 0.35, 1);
const FOLD = Easing.bezierFn(0.55, 0, 1, 0.45);
const UNFOLD = Easing.bezierFn(0, 0.55, 0.45, 1);
const RISE = Easing.bezierFn(0.3, 1.5, 0.5, 1);
const THROW = Easing.bezierFn(0.15, 0.75, 0.35, 1);
const quadOut = (x: number) => {
  'worklet';
  return 1 - (1 - x) * (1 - x);
};

/**
 * The space the curtain covers, and where the lifafa sits in it: centred, a little above the
 * middle. On Android useWindowDimensions leaves out the status and navigation bars while the app
 * draws edge to edge, which left a strip at the bottom uncovered, so the curtain fills its parent
 * and measures itself; the window size only stands in until that first layout.
 */
function useLayout() {
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const width = measured?.width ?? window.width;
  const height = measured?.height ?? window.height;
  const envLeft = (width - ENV_W) / 2;
  const envTop = Math.round(height / 2 - 72);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setMeasured((m) => (m && m.width === w && m.height === h ? m : { width: w, height: h }));
  }, []);
  return { width, height, envLeft, envTop, wordTop: envTop + 180, onLayout };
}

/** Pivot a scale around one edge: RN scales around the centre. */
const aroundTop = (h: number, scaleY: number) => {
  'worklet';
  return [{ translateY: -h / 2 }, { scaleY }, { translateY: h / 2 }];
};
const aroundBottom = (h: number, scale: { scaleX: number } | { scaleY: number }) => {
  'worklet';
  return [{ translateY: h / 2 }, scale, { translateY: -h / 2 }];
};

type Clock = { t: SharedValue<number> };

const BITS = [
  { w: 12, h: 12, r: 6, bg: '#FFFFFF' },
  { w: 9, h: 16, r: 9, bg: '#2E6A3E', leaf: true },
  { w: 10, h: 10, r: 2, bg: MAROON },
  { w: 12, h: 12, r: 6, bg: GOLD, ring: true },
  { w: 7, h: 14, r: 4, bg: '#FFF1C7' },
] as const;

/** Confetti: petals, leaves and gold flecks thrown out from the coin, then falling. */
function Bit({ t, j }: Clock & { j: number }) {
  const kind = BITS[j % BITS.length]!;
  const ang = (j / 18) * Math.PI * 2 + (j % 3) * 0.17;
  const dist = 100 + ((j * 37) % 70);
  const x = Math.round(Math.cos(ang) * dist);
  const y = Math.round(Math.sin(ang) * dist * 0.8 - 30);
  const fall = 50 + (j % 4) * 18;
  const spin = (j % 2 ? 1 : -1) * (180 + j * 20);
  const motion = useAnimatedStyle(() => {
    const v = THROW(step(t.value, 980 + j * 12, 900));
    const at = [0, 0.45, 1];
    return {
      opacity: interpolate(v, [0, 0.12, 0.8, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: interpolate(v, at, [0, x, x]) },
        { translateY: interpolate(v, at, [0, y, y + fall]) },
        { rotate: `${interpolate(v, at, [0, spin / 2, spin])}deg` },
        { scale: interpolate(v, at, [0.2, 1, 0.9]) },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: COIN_X - kind.w / 2,
          top: COIN_Y - kind.h / 2,
          width: kind.w,
          height: kind.h,
          backgroundColor: kind.bg,
          borderRadius: kind.r,
        },
        'leaf' in kind ? { borderTopRightRadius: 0, borderBottomLeftRadius: 0 } : null,
        'ring' in kind ? { borderWidth: 3, borderColor: GOLD_DARK } : null,
        motion,
      ]}
    />
  );
}

/** The ₹1 shagun coin: shoots out of the lifafa flipping twice, then catches the light. */
function Coin({ t }: Clock) {
  const rise = useAnimatedStyle(() => ({
    transform: [{ translateY: -COIN_RISE * RISE(step(t.value, 880, 520)) }],
  }));
  const flip = useAnimatedStyle(() => ({
    transform: [{ scaleX: interpolate(step(t.value, 880, 520), [0, 0.25, 0.5, 0.75, 1], [1, -1, 1, -1, 1]) }],
  }));
  const glint = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(quadOut(step(t.value, 1480, 380)), [0, 1], [-56, 56]) }, { rotate: '20deg' }],
  }));
  return (
    <Animated.View style={[styles.coinBox, rise]}>
      <Animated.View style={[styles.coin, flip]}>
        <Text style={styles.coinText} allowFontScaling={false}>
          ₹
        </Text>
        <Animated.View style={[styles.glint, glint]} />
      </Animated.View>
    </Animated.View>
  );
}

/** Where the drop is along the way, and the lifafa's shape there: falls, lands at 0.5, squashes. */
const DROP_AT = [0, 0.2, 0.35, 0.45, 0.5, 0.68, 0.84, 1];

/** The maroon lifafa: falls in, squashes on landing, then its flap flips open. */
function Lifafa({ t, left, top }: Clock & { left: number; top: number }) {
  // It falls from just above the screen, with gravity (ease-in) until it lands.
  const fall = top + ENV_H + 24;
  const drop = useAnimatedStyle(() => {
    const p = step(t.value, 200, 560);
    return {
      transform: [
        { translateY: interpolate(p, DROP_AT, [-fall, -fall * 0.84, -fall * 0.51, -fall * 0.19, 0, -14, 0, 0]) },
        { rotate: `${interpolate(p, [0, 0.5, 1], [-10, 0, 0])}deg` },
        // Squash from the bottom edge, where it lands.
        ...aroundBottom(ENV_H, { scaleX: interpolate(p, DROP_AT, [1, 1, 1, 1, 1.1, 0.95, 1.03, 1]) }),
        ...aroundBottom(ENV_H, { scaleY: interpolate(p, DROP_AT, [1, 1, 1, 1, 0.84, 1.07, 0.97, 1]) }),
      ],
    };
  });
  const closedFlap = useAnimatedStyle(() => ({
    transform: aroundTop(FLAP_H, interpolate(FOLD(step(t.value, 760, 80)), [0, 1], [1, 0.001])),
  }));
  const openFlap = useAnimatedStyle(() => ({
    transform: aroundBottom(FLAP_H, { scaleY: interpolate(UNFOLD(step(t.value, 840, 110)), [0, 1], [0.001, 1]) }),
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left, top, width: ENV_W, height: ENV_H }, drop]}>
      <Animated.View style={[styles.openFlap, openFlap]} />
      {Array.from({ length: 18 }, (_, j) => (
        <Bit key={j} t={t} j={j} />
      ))}
      <Coin t={t} />
      <View style={styles.body}>
        <View style={styles.bodyFold} />
        <View style={styles.bodyTrim} />
        <Text style={styles.shubh} allowFontScaling={false}>
          शुभ
        </Text>
      </View>
      <Animated.View style={[styles.closedFlapBox, closedFlap]}>
        <View style={styles.closedFlap} />
        <View style={styles.seal} />
      </Animated.View>
    </Animated.View>
  );
}

/** One word of the name. Whole words keep the font's own spacing (single letters would lose it). */
function Word({ t, text, i }: Clock & { text: string; i: number }) {
  const pop = useAnimatedStyle(() => {
    const v = SPRING(step(t.value, 1150 + i * 110, 460));
    return {
      opacity: Math.min(1, Math.max(0, v / 0.4)),
      transform: [{ translateY: interpolate(v, [0, 1], [24, 0]) }, { scale: interpolate(v, [0, 1], [0.7, 1]) }],
    };
  });
  return (
    <Animated.View style={pop}>
      <Text style={styles.title} allowFontScaling={false}>
        {text}
      </Text>
    </Animated.View>
  );
}

/**
 * Writes the Hindi name in from left to right, like SignInIntro's InkReveal but on the splash
 * clock: a clip window slides right while the text inside slides back by the same amount.
 */
function Ink({ t, children }: Clock & { children: ReactNode }) {
  const [width, onLayout] = useInkWidth();
  const clip = useAnimatedStyle(() => ({
    transform: [{ translateX: -width * (1 - IN_OUT(step(t.value, 1350, 500))) }],
  }));
  const text = useAnimatedStyle(() => ({
    transform: [{ translateX: width * (1 - IN_OUT(step(t.value, 1350, 500))) }],
  }));
  return (
    <View style={{ alignSelf: 'center', minWidth: width, opacity: width ? 1 : 0 }} onLayout={onLayout}>
      <Animated.View style={[{ overflow: 'hidden' }, clip]}>
        <Animated.View style={text}>{children}</Animated.View>
      </Animated.View>
    </View>
  );
}

function Wordmark({ t, top }: Clock & { top: number }) {
  return (
    <View style={[styles.wordmark, { top }]}>
      <View style={styles.titleRow}>
        <Word t={t} text="Shagun" i={0} />
        <Word t={t} text="Register" i={1} />
      </View>
      <Ink t={t}>
        <Text style={styles.hindi} allowFontScaling={false}>
          शगुन रजिस्टर
        </Text>
      </Ink>
    </View>
  );
}

/**
 * Covers the app from launch until the opening has played and the app is ready.
 * `fontsReady`: Mukta and Rozha One are loaded (until then it is plain marigold, like the native splash).
 * `appReady`: the screen underneath can be shown.
 */
export function BootSplash({ fontsReady, appReady, onDone }: { fontsReady: boolean; appReady: boolean; onDone: () => void }) {
  const { width, height, envLeft, envTop, wordTop, onLayout: measure } = useLayout();
  const preference = useMotionPreference();
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    // If the drawing engine can't load, play without the full-screen layers rather than hang.
    loadScene().then(
      () => setSceneReady(true),
      () => setSceneReady(true),
    );
  }, []);
  const ready = fontsReady && sceneReady;
  const mode = ready ? preference : 'pending';
  const [introDone, setIntroDone] = useState(false);
  const { t, frames } = useSplashClock();
  const out = useSharedValue(0);
  const lift = useSharedValue(0);

  // The native splash can go as soon as this (identical, plain marigold) view is on screen.
  const onLayout = (e: LayoutChangeEvent) => {
    measure(e);
    void SplashScreen.hideAsync().catch(() => {});
  };

  useEffect(() => {
    if (mode === 'play') frames.setActive(true);
    if (mode !== 'still') return;
    t.value = STILL_T;
    const timer = setTimeout(() => setIntroDone(true), STILL_FOR);
    return () => clearTimeout(timer);
  }, [mode, frames, t]);

  // The curtain starts to go when the clock reaches LIFT_AT (or later, if the app isn't ready).
  useAnimatedReaction(
    () => mode === 'play' && t.value >= LIFT_AT - 100,
    (played, before) => {
      if (played && !before) scheduleOnRN(setIntroDone, true);
    },
  );

  useEffect(() => {
    if (!introDone || !appReady) return;
    useBoot.setState({ revealed: true });
    const finish = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(onDone);
    };
    if (mode === 'still') {
      lift.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }, finish);
    } else {
      out.value = withTiming(1, { duration: 220, easing: Easing.bezier(0.55, 0, 1, 0.45) });
      lift.value = withDelay(100, withTiming(1, { duration: 450, easing: Easing.bezier(0.7, 0, 0.25, 1) }, finish));
    }
    return () => {
      cancelAnimation(out);
      cancelAnimation(lift);
    };
  }, [introDone, appReady, mode, out, lift, onDone]);

  const curtain = useAnimatedStyle(() =>
    mode === 'still' ? { opacity: 1 - lift.value } : { transform: [{ translateY: -lift.value * (height + 60) }] },
  );
  const content = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ scale: 1 + 0.08 * out.value }],
  }));

  const scene = { width, height, cx: width / 2, cy: envTop + ENV_H / 2, coinX: envLeft + COIN_X, coinY: envTop + COIN_Y, t };

  // The Skia layers go in at once, on plain marigold with the clock at 0 (they draw nothing yet),
  // so setting up their canvases is done before anything moves.
  return (
    <Animated.View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Shagun Register is opening"
      style={[styles.curtain, curtain]}
    >
      {/* A toran hangs from the curtain's edge, seen as it lifts. */}
      <View style={[styles.garland, { top: height, width }]} importantForAccessibility="no-hide-descendants">
        <View style={[styles.garlandThread, { width }]} />
        {Array.from({ length: Math.ceil(width / BEAD_SIZE) }, (_, i) => (
          <View key={i} style={[styles.garlandBead, { left: i * BEAD_SIZE }]}>
            <Bead />
          </View>
        ))}
      </View>
      {sceneReady ? <SplashScene layer="back" {...scene} /> : null}
      {ready ? (
        <Animated.View style={[StyleSheet.absoluteFill, content]}>
          <Lifafa t={t} left={envLeft} top={envTop} />
          <Wordmark t={t} top={wordTop} />
        </Animated.View>
      ) : null}
      {sceneReady ? <SplashScene layer="front" {...scene} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  curtain: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: GROUND, zIndex: 100, elevation: 100 },
  garland: { position: 'absolute', left: 0, height: 36 },
  garlandThread: { position: 'absolute', left: 0, top: 0, height: 4, backgroundColor: MAROON },
  garlandBead: { position: 'absolute', top: 2, width: BEAD_SIZE, height: BEAD_SIZE },
  openFlap: {
    position: 'absolute',
    left: 0,
    top: -FLAP_H,
    width: 0,
    height: 0,
    borderLeftWidth: ENV_W / 2,
    borderRightWidth: ENV_W / 2,
    borderBottomWidth: FLAP_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: MAROON_DARK,
  },
  coinBox: { position: 'absolute', left: (ENV_W - COIN) / 2, top: 4, width: COIN, height: COIN + 4 },
  coin: {
    width: COIN,
    height: COIN,
    borderRadius: COIN / 2,
    backgroundColor: GOLD,
    borderWidth: 4,
    borderColor: GOLD_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coinText: { color: '#7A3E00', fontSize: 30, lineHeight: 36, fontWeight: '800' },
  glint: { position: 'absolute', top: -12, left: 22, width: 11, height: 90, backgroundColor: 'rgba(255,255,255,0.75)' },
  body: { position: 'absolute', left: 0, top: 0, width: ENV_W, height: ENV_H, borderRadius: 12, backgroundColor: MAROON, overflow: 'hidden' },
  // The lower fold of the lifafa: a wide triangle rising from the bottom edge.
  bodyFold: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: ENV_W / 2,
    borderRightWidth: ENV_W / 2,
    borderBottomWidth: ENV_H * 0.6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#6A1726',
  },
  bodyTrim: { position: 'absolute', left: 8, top: 8, right: 8, bottom: 8, borderWidth: 1.5, borderColor: 'rgba(244,165,28,0.75)', borderRadius: 7 },
  shubh: { position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center', fontFamily: fonts.wordmark, fontSize: 26, lineHeight: 36, color: GOLD },
  closedFlapBox: { position: 'absolute', left: 0, top: 0, width: ENV_W, height: FLAP_H },
  closedFlap: {
    width: 0,
    height: 0,
    borderLeftWidth: ENV_W / 2,
    borderRightWidth: ENV_W / 2,
    borderTopWidth: FLAP_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#8E2539',
  },
  seal: {
    position: 'absolute',
    left: ENV_W / 2 - 14,
    top: FLAP_H - 15,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GOLD,
    borderWidth: 3,
    borderColor: GOLD_DARK,
  },
  wordmark: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 2 },
  titleRow: { flexDirection: 'row', gap: 9 },
  title: { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 44, color: MAROON, letterSpacing: -0.3 },
  hindi: { fontFamily: fonts.wordmark, fontSize: 24, lineHeight: 34, color: MAROON },
});
