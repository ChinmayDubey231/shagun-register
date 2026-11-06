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
 * coin and name are React Native views on top.
 *
 * It plays while the database, fonts and saved sign-in load, and lifts at 2.05 s or as soon
 * as the app is ready, whichever is later, so it never adds waiting of its own.
 * The phone's native splash is plain marigold, so this picks up from it without a seam.
 * With Reduce motion on, the open lifafa is shown still for 0.7 s and then fades.
 */
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useBoot } from '@/store/boot';
import { loadScene } from './splash/loadScene';
import { SplashScene } from './splash/SplashScene';
import { colors, fonts } from '@/theme';
import {
  BEAD_SIZE,
  Bead,
  clampOpacity,
  InkReveal,
  MotionMode,
  native,
  SPRING,
  useMotionPreference,
  useProgress,
} from './SignInIntro';

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
const aroundTop = (h: number, t: object) => [{ translateY: -h / 2 }, t, { translateY: h / 2 }];
const aroundBottom = (h: number, t: object) => [{ translateY: h / 2 }, t, { translateY: -h / 2 }];

const BITS = [
  { w: 12, h: 12, r: 6, bg: '#FFFFFF' },
  { w: 9, h: 16, r: 9, bg: '#2E6A3E', leaf: true },
  { w: 10, h: 10, r: 2, bg: MAROON },
  { w: 12, h: 12, r: 6, bg: GOLD, ring: true },
  { w: 7, h: 14, r: 4, bg: '#FFF1C7' },
] as const;

/** Confetti: petals, leaves and gold flecks thrown out from the coin, then falling. */
function Bit({ j }: { j: number }) {
  const v = useProgress(980 + j * 12, 900, Easing.bezier(0.15, 0.75, 0.35, 1));
  const kind = BITS[j % BITS.length]!;
  const ang = (j / 18) * Math.PI * 2 + (j % 3) * 0.17;
  const dist = 100 + ((j * 37) % 70);
  const x = Math.round(Math.cos(ang) * dist);
  const y = Math.round(Math.sin(ang) * dist * 0.8 - 30);
  const fall = 50 + (j % 4) * 18;
  const spin = (j % 2 ? 1 : -1) * (180 + j * 20);
  const at = [0, 0.45, 1];
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
        {
          opacity: v.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: v.interpolate({ inputRange: at, outputRange: [0, x, x] }) },
            { translateY: v.interpolate({ inputRange: at, outputRange: [0, y, y + fall] }) },
            { rotate: v.interpolate({ inputRange: at, outputRange: ['0deg', `${spin / 2}deg`, `${spin}deg`] }) },
            { scale: v.interpolate({ inputRange: at, outputRange: [0.2, 1, 0.9] }) },
          ],
        },
      ]}
    />
  );
}

/** The ₹1 shagun coin: shoots out of the lifafa flipping twice, then catches the light. */
function Coin() {
  const rise = useProgress(880, 520, Easing.bezier(0.3, 1.5, 0.5, 1));
  const flip = useProgress(880, 520, Easing.linear);
  const glint = useProgress(1480, 380, Easing.out(Easing.quad));
  return (
    <Animated.View
      style={[
        styles.coinBox,
        { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -COIN_RISE] }) }] },
      ]}
    >
      <Animated.View
        style={[
          styles.coin,
          { transform: [{ scaleX: flip.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, -1, 1, -1, 1] }) }] },
        ]}
      >
        <Text style={styles.coinText} allowFontScaling={false}>
          ₹
        </Text>
        <Animated.View
          style={[
            styles.glint,
            { transform: [{ translateX: glint.interpolate({ inputRange: [0, 1], outputRange: [-56, 56] }) }, { rotate: '20deg' }] },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

/** The maroon lifafa: falls in, squashes on landing, then its flap flips open. */
function Lifafa({ left, top }: { left: number; top: number }) {
  const drop = useProgress(200, 560, Easing.linear);
  const fold = useProgress(760, 80, Easing.bezier(0.55, 0, 1, 0.45));
  const unfold = useProgress(840, 110, Easing.bezier(0, 0.55, 0.45, 1));
  // Falls with gravity (ease-in) until it lands at 0.5, then squash and stretch.
  const t = [0, 0.2, 0.35, 0.45, 0.5, 0.68, 0.84, 1];
  return (
    <Animated.View
      style={[
        { position: 'absolute', left, top, width: ENV_W, height: ENV_H },
        {
          transform: [
            { translateY: drop.interpolate({ inputRange: t, outputRange: [-480, -403, -245, -91, 0, -14, 0, 0] }) },
            { rotate: drop.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-10deg', '0deg', '0deg'] }) },
            // Squash from the bottom edge, where it lands.
            ...aroundBottom(ENV_H, { scaleX: drop.interpolate({ inputRange: t, outputRange: [1, 1, 1, 1, 1.1, 0.95, 1.03, 1] }) }),
            ...aroundBottom(ENV_H, { scaleY: drop.interpolate({ inputRange: t, outputRange: [1, 1, 1, 1, 0.84, 1.07, 0.97, 1] }) }),
          ],
        },
      ]}
    >
      <Animated.View
        style={[
          styles.openFlap,
          { transform: aroundBottom(FLAP_H, { scaleY: unfold.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] }) }) },
        ]}
      />
      {Array.from({ length: 18 }, (_, j) => (
        <Bit key={j} j={j} />
      ))}
      <Coin />
      <View style={styles.body}>
        <View style={styles.bodyFold} />
        <View style={styles.bodyTrim} />
        <Text style={styles.shubh} allowFontScaling={false}>
          शुभ
        </Text>
      </View>
      <Animated.View
        style={[
          styles.closedFlapBox,
          { transform: aroundTop(FLAP_H, { scaleY: fold.interpolate({ inputRange: [0, 1], outputRange: [1, 0.001] }) }) },
        ]}
      >
        <View style={styles.closedFlap} />
        <View style={styles.seal} />
      </Animated.View>
    </Animated.View>
  );
}

/** One word of the name. Whole words keep the font's own spacing (single letters would lose it). */
function Word({ text, i }: { text: string; i: number }) {
  const v = useProgress(1150 + i * 110, 460, SPRING);
  return (
    <Animated.View
      style={{
        opacity: clampOpacity(v, 0.4),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        ],
      }}
    >
      <Text style={styles.title} allowFontScaling={false}>
        {text}
      </Text>
    </Animated.View>
  );
}

function Wordmark({ top }: { top: number }) {
  return (
    <View style={[styles.wordmark, { top }]}>
      <View style={styles.titleRow}>
        <Word text="Shagun" i={0} />
        <Word text="Register" i={1} />
      </View>
      <InkReveal delay={1350} duration={500} align="center">
        <Text style={styles.hindi} allowFontScaling={false}>
          शगुन रजिस्टर
        </Text>
      </InkReveal>
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
  const out = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;

  // The native splash can go as soon as this (identical, plain marigold) view is on screen.
  const onLayout = (e: LayoutChangeEvent) => {
    measure(e);
    void SplashScreen.hideAsync().catch(() => {});
  };

  useEffect(() => {
    if (mode === 'pending') return;
    const timer = setTimeout(() => setIntroDone(true), mode === 'still' ? STILL_FOR : LIFT_AT - 100);
    return () => clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    if (!introDone || !appReady) return;
    useBoot.setState({ revealed: true });
    const exit =
      mode === 'still'
        ? Animated.timing(lift, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: native })
        : Animated.parallel([
            Animated.timing(out, { toValue: 1, duration: 220, easing: Easing.bezier(0.55, 0, 1, 0.45), useNativeDriver: native }),
            Animated.timing(lift, { toValue: 1, duration: 450, delay: 100, easing: Easing.bezier(0.7, 0, 0.25, 1), useNativeDriver: native }),
          ]);
    exit.start(({ finished }) => finished && onDone());
    return () => exit.stop();
  }, [introDone, appReady, mode, out, lift, onDone]);

  const scene = { width, height, cx: width / 2, cy: envTop + ENV_H / 2, coinX: envLeft + COIN_X, coinY: envTop + COIN_Y, still: mode === 'still' };

  const curtain =
    mode === 'still'
      ? { opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
      : { transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -(height + 60)] }) }] };

  return (
    <Animated.View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Shagun Register is opening"
      style={[styles.curtain, curtain]}
    >
      <MotionMode.Provider value={mode}>
        {/* A toran hangs from the curtain's edge, seen as it lifts. */}
        <View style={[styles.garland, { top: height, width }]} importantForAccessibility="no-hide-descendants">
          <View style={[styles.garlandThread, { width }]} />
          {Array.from({ length: Math.ceil(width / BEAD_SIZE) }, (_, i) => (
            <View key={i} style={[styles.garlandBead, { left: i * BEAD_SIZE }]}>
              <Bead />
            </View>
          ))}
        </View>
        {mode !== 'pending' ? <SplashScene layer="back" {...scene} /> : null}
        {ready ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [{ scale: out.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
              },
            ]}
          >
            <Lifafa left={envLeft} top={envTop} />
            <Wordmark top={wordTop} />
          </Animated.View>
        ) : null}
        {mode !== 'pending' ? <SplashScene layer="front" {...scene} /> : null}
      </MotionMode.Provider>
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
