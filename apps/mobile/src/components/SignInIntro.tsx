/**
 * The sign-in opening ("the shagun arrives"), from the design canvas's
 * "01b Sign-in animation — timing spec":
 *   toran thread draws → marigolds drop and sway → श mark pops → ₹ coin lands with a glint
 *   → name rises, शगुन रजिस्टर is inked in → tagline, features, button.
 * Plays once, about 1.7 s. With Reduce motion on, everything is shown at once and nothing moves.
 * Only opacity and transforms animate, on the native driver, so typing is never delayed.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useBoot } from "@/store/boot";
import { colors } from "@/theme";

export type MotionMode = "pending" | "play" | "still";
/** Whether the motion inside it plays, shows its end state at once (Reduce motion), or waits. */
export const MotionMode = createContext<MotionMode>("still");
const IntroMode = MotionMode;

export const native = Platform.OS !== "web";
export const SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);
export const OUT = Easing.bezier(0.2, 0.7, 0.2, 1);
export const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const COIN = Easing.bezier(0.3, 1.4, 0.5, 1);

/** 'play', or 'still' when the system's Reduce motion is on; 'pending' until known. */
export function useMotionPreference(): MotionMode {
  const [mode, setMode] = useState<MotionMode>("pending");
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => alive && setMode(reduced ? "still" : "play"))
      .catch(() => alive && setMode("play"));
    return () => {
      alive = false;
    };
  }, []);
  return mode;
}

/**
 * Wrap the screen: decides once whether to play, honouring the system's Reduce motion.
 * On a cold start it waits for the opening splash to start lifting, so it plays as it is revealed.
 */
export function IntroProvider({ children }: { children: ReactNode }) {
  const preference = useMotionPreference();
  const revealed = useBoot((s) => s.revealed);
  return (
    <IntroMode.Provider value={revealed ? preference : "pending"}>
      {children}
    </IntroMode.Provider>
  );
}

/** A 0→1 value that runs once after `delay` ms (or jumps to 1 when motion is reduced). */
export function useProgress(
  delay: number,
  duration: number,
  easing: (t: number) => number,
) {
  const mode = useContext(IntroMode);
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (mode === "pending") return;
    if (mode === "still") {
      value.setValue(1);
      return;
    }
    const anim = Animated.timing(value, {
      toValue: 1,
      duration,
      delay,
      easing,
      useNativeDriver: native,
    });
    anim.start();
    return () => anim.stop();
  }, [mode, value, delay, duration, easing]);
  return value;
}

export const clampOpacity = (v: Animated.Value, until = 1) =>
  v.interpolate({
    inputRange: [0, until],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

type EnterKind = "rise" | "pop" | "fade";

/** Entrance for one block of the screen. Delays come from the timing spec. */
export function Enter({
  kind = "rise",
  delay,
  duration,
  style,
  children,
}: {
  kind?: EnterKind;
  delay: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const ms = duration ?? (kind === "pop" ? 480 : kind === "fade" ? 320 : 420);
  const v = useProgress(
    delay,
    ms,
    kind === "pop" ? SPRING : kind === "fade" ? Easing.out(Easing.quad) : OUT,
  );
  const animated =
    kind === "pop"
      ? {
          opacity: clampOpacity(v, 0.6),
          transform: [
            {
              scale: v.interpolate({
                inputRange: [0, 1],
                outputRange: [0.6, 1],
              }),
            },
          ],
        }
      : kind === "rise"
        ? {
            opacity: clampOpacity(v),
            transform: [
              {
                translateY: v.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          }
        : { opacity: clampOpacity(v) };
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * Writes its child in from left to right, like ink in a register. A clip window slides right
 * while the content inside slides back by the same amount, so the text stays still and is
 * uncovered left to right over any background (no cover colour, native driver only).
 */
export function InkReveal({
  delay,
  duration = 600,
  align = "flex-start",
  children,
}: {
  delay: number;
  duration?: number;
  align?: "flex-start" | "center";
  children: ReactNode;
}) {
  const v = useProgress(delay, duration, IN_OUT);
  const [width, setWidth] = useState(0);
  // The box hugs the text, and Android rounds that width down a fraction of a pixel, which
  // wraps the last word onto a clipped second line. Holding the box at the rounded-up width
  // gives the text room; it only grows again if the text itself gets wider.
  const onLayout = (e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.width;
    setWidth((w) => (measured > w ? Math.ceil(measured) + 2 : w));
  };
  const shift = (sign: number) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [sign * width, 0] });
  return (
    <View
      style={{ alignSelf: align, minWidth: width, opacity: width ? 1 : 0 }}
      onLayout={onLayout}
    >
      {/* The clip window is the part that moves. */}
      <Animated.View
        style={{ overflow: "hidden", transform: [{ translateX: shift(-1) }] }}
      >
        <Animated.View style={{ transform: [{ translateX: shift(1) }] }}>
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const UNIT = 30;

function Marigold({ index }: { index: number }) {
  const mode = useContext(IntroMode);
  const drop = useProgress(80 + index * 30, 520, SPRING);
  const sway = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (mode !== "play") return;
    const half = {
      duration: 3400,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: native,
    };
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { ...half, toValue: 1 }),
        Animated.timing(sway, { ...half, toValue: 0 }),
      ]),
    );
    // Each marigold starts its sway a little later, so the garland ripples instead of swinging as one.
    const start = setTimeout(() => loop.start(), 1000 + index * 270);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [mode, sway, index]);
  const rotate = sway.interpolate({
    inputRange: [0, 1],
    outputRange: ["-4deg", "4deg"],
  });
  return (
    <Animated.View
      style={[
        styles.unit,
        { left: index * UNIT },
        {
          opacity: clampOpacity(drop, 0.5),
          transform: [
            {
              translateY: drop.interpolate({
                inputRange: [0, 1],
                outputRange: [-34, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* Pivot at the top of the unit: it hangs from the thread. */}
      <Animated.View
        style={[
          styles.unitInner,
          {
            transform: [
              { translateY: -UNIT / 2 },
              { rotate },
              { translateY: UNIT / 2 },
            ],
          },
        ]}
      >
        <Bead />
      </Animated.View>
    </Animated.View>
  );
}

/** One unit of the toran, 30×30: a hanging leaf and a marigold. */
export function Bead() {
  return (
    <>
      <View style={styles.leaf} />
      <View style={styles.flower}>
        <View style={styles.flowerHeart} />
      </View>
    </>
  );
}

export const BEAD_SIZE = UNIT;

/** The toran across the top: the thread draws, marigolds drop onto it, then sway. */
export function Toran() {
  const { width } = useWindowDimensions();
  const thread = useProgress(0, 400, IN_OUT);
  const count = Math.ceil(width / UNIT);
  return (
    <View
      style={[styles.toran, { width }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {Array.from({ length: count }, (_, i) => (
        <Marigold key={i} index={i} />
      ))}
      <Animated.View
        style={[
          styles.thread,
          { width },
          // Scale from the left edge.
          {
            transform: [
              { translateX: -width / 2 },
              {
                scaleX: thread.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.001, 1],
                }),
              },
              { translateX: width / 2 },
            ],
          },
        ]}
      />
    </View>
  );
}

/** The ₹1 shagun coin: spins down onto the mark's corner and catches the light once. */
export function ShagunCoin() {
  const land = useProgress(600, 560, COIN);
  const glint = useProgress(1150, 450, Easing.out(Easing.quad));
  return (
    <Animated.View
      style={[
        styles.coin,
        {
          opacity: clampOpacity(land, 0.5),
          transform: [
            {
              translateX: land.interpolate({
                inputRange: [0, 1],
                outputRange: [40, 0],
              }),
            },
            {
              translateY: land.interpolate({
                inputRange: [0, 1],
                outputRange: [-70, 0],
              }),
            },
            {
              rotate: land.interpolate({
                inputRange: [0, 1],
                outputRange: ["-200deg", "0deg"],
              }),
            },
          ],
        },
      ]}
    >
      <Animated.Text style={styles.coinText} allowFontScaling={false}>
        ₹
      </Animated.Text>
      <Animated.View
        style={[
          styles.glint,
          {
            transform: [
              {
                translateX: glint.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-34, 34],
                }),
              },
              { rotate: "20deg" },
            ],
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toran: { position: "absolute", top: 0, left: 0, height: 34 },
  thread: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 4,
    backgroundColor: colors.sindoor,
  },
  unit: { position: "absolute", top: 2, width: UNIT, height: UNIT },
  unitInner: { width: UNIT, height: UNIT },
  // An almond leaf hanging from the thread: a square with two rounded corners, turned upright.
  leaf: {
    position: 'absolute',
    left: 1,
    top: 6.5,
    width: 14,
    height: 14,
    backgroundColor: '#2E6A3E',
    borderTopLeftRadius: 14,
    borderBottomRightRadius: 14,
    transform: [{ rotate: '-45deg' }],
  },
  flower: {
    position: "absolute",
    left: 17,
    top: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.marigold,
    alignItems: "center",
    justifyContent: "center",
  },
  flowerHeart: {
    width: 4.4,
    height: 4.4,
    borderRadius: 2.2,
    backgroundColor: "#D9830B",
  },
  coin: {
    position: "absolute",
    top: -8,
    right: -10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.marigold,
    borderWidth: 2,
    borderColor: "#D9830B",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coinText: {
    color: "#6B3A00",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
  },
  glint: {
    position: "absolute",
    top: -8,
    left: 7,
    width: 7,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
});
