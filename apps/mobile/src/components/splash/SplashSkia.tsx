/**
 * The full-screen part of the opening splash, drawn with React Native Skia and driven by one
 * Reanimated clock on the UI thread. Two layers:
 *   back:  sunrise glow spreading from the lifafa, turning light rays across the whole screen,
 *          a rangoli ring drawn around the lifafa, toran swags dropping in at the top, and a
 *          scalloped rangoli border drawn along the bottom;
 *   front: a shower of marigold petals and leaves over the whole screen, and twinkling sparkles.
 * Timings line up with BootSplash (t = 0 is when the splash starts playing).
 */
import { BlurMask, Canvas, Circle, Group, Oval, Path, RadialGradient, Rect, Skia, useClock, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

export interface SplashSkiaProps {
  layer: 'back' | 'front';
  width: number;
  height: number;
  /** Centre of the lifafa. */
  cx: number;
  cy: number;
  /** Where the coin ends up. */
  coinX: number;
  coinY: number;
  /** Reduce motion: draw one finished frame and hold it. */
  still: boolean;
}

const MARIGOLD = '#F4A51C';
const MAROON = '#7A1C2E';
const LEAF = '#2E6A3E';
/** The frame shown when motion is reduced. */
const STILL_T = 1900;

// ---- small worklet helpers -------------------------------------------------
const clamp01 = (x: number) => {
  'worklet';
  return Math.min(1, Math.max(0, x));
};
/** Progress of a step that starts at `start` and lasts `dur` ms. */
const step = (t: number, start: number, dur: number) => {
  'worklet';
  return clamp01((t - start) / dur);
};
const easeOut = (x: number) => {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
};
/** Overshoots a little and settles: things that land. */
const backOut = (x: number) => {
  'worklet';
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Deterministic pseudo-random in [0, 1), so the scene is the same on every launch. */
const rand = (i: number, k: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

function useTime(still: boolean) {
  const clock = useClock();
  return useDerivedValue(() => (still ? STILL_T : clock.value));
}

// ---- back layer ------------------------------------------------------------

function Sunrise({ t, w, h, cx, cy }: { t: SharedValue<number>; w: number; h: number; cx: number; cy: number }) {
  const diag = Math.hypot(w, h);
  // A bright glow grows out from the lifafa until it fills the screen, then breathes.
  const r = useDerivedValue(() => Math.max(1, easeOut(step(t.value, 0, 700)) * diag * 0.8 * (1 + 0.035 * Math.sin(t.value / 650))));
  const vignette = useDerivedValue(() => step(t.value, 100, 600));
  return (
    <>
      <Rect x={0} y={0} width={w} height={h} color={MARIGOLD} />
      <Rect x={0} y={0} width={w} height={h}>
        <RadialGradient c={vec(cx, cy)} r={r} colors={['#FFF0B8', '#FFD45C', '#F9B630', '#F4A51C00']} positions={[0, 0.22, 0.6, 1]} />
      </Rect>
      {/* Deeper saffron at the edges gives the screen depth. */}
      <Group opacity={vignette}>
        <Rect x={0} y={0} width={w} height={h}>
          <RadialGradient c={vec(cx, cy)} r={diag * 0.62} colors={['#E0780A00', '#E0780A00', '#D86A08AA']} positions={[0, 0.55, 1]} />
        </Rect>
      </Group>
    </>
  );
}

function Rays({ t, w, h, cx, cy }: { t: SharedValue<number>; w: number; h: number; cx: number; cy: number }) {
  const path = useMemo(() => {
    const L = Math.hypot(w, h);
    const b = Skia.PathBuilder.Make();
    const n = 18;
    const half = (Math.PI / n) * 0.42;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      b.moveTo(cx, cy);
      b.lineTo(cx + L * Math.cos(a - half), cy + L * Math.sin(a - half));
      b.lineTo(cx + L * Math.cos(a + half), cy + L * Math.sin(a + half));
      b.close();
    }
    return b.build();
  }, [w, h, cx, cy]);
  const opacity = useDerivedValue(() => step(t.value, 250, 600) * 0.2);
  // One full turn every 40 s.
  const transform = useDerivedValue(() => [{ rotate: (t.value / 40000) * Math.PI * 2 }]);
  return (
    <Group opacity={opacity} origin={vec(cx, cy)} transform={transform}>
      <Path path={path} color="#FFFFFF" />
    </Group>
  );
}

function Rangoli({ t, cx, cy }: { t: SharedValue<number>; cx: number; cy: number }) {
  const { ring, dots, inner } = useMemo(() => {
    const petals = 24;
    const r = 150;
    const ringB = Skia.PathBuilder.Make();
    for (let i = 0; i <= petals; i++) {
      const a0 = (i / petals) * Math.PI * 2;
      const a1 = ((i + 0.5) / petals) * Math.PI * 2;
      const a2 = ((i + 1) / petals) * Math.PI * 2;
      if (i === 0) ringB.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
      if (i < petals) ringB.quadTo(cx + (r + 34) * Math.cos(a1), cy + (r + 34) * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2));
    }
    const dotsB = Skia.PathBuilder.Make();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 - Math.PI / 2;
      dotsB.addCircle(cx + 196 * Math.cos(a), cy + 196 * Math.sin(a), 3);
    }
    const innerB = Skia.PathBuilder.Make().addCircle(cx, cy, 134);
    return { ring: ringB.build(), dots: dotsB.build(), inner: innerB.build() };
  }, [cx, cy]);
  const ringEnd = useDerivedValue(() => easeOut(step(t.value, 350, 800)));
  const innerEnd = useDerivedValue(() => easeOut(step(t.value, 450, 700)));
  const dotsEnd = useDerivedValue(() => step(t.value, 750, 700));
  // Turns slowly the other way to the rays.
  const transform = useDerivedValue(() => [{ rotate: (-t.value / 60000) * Math.PI * 2 }]);
  return (
    <Group origin={vec(cx, cy)} transform={transform} opacity={0.5}>
      <Path path={ring} style="stroke" strokeWidth={3} strokeCap="round" color={MAROON} start={0} end={ringEnd} />
      <Path path={inner} style="stroke" strokeWidth={1.5} color={MAROON} start={0} end={innerEnd} />
      <Path path={dots} color={MAROON} start={0} end={dotsEnd} />
    </Group>
  );
}

/** Marigold-and-leaf beads along a quadratic swag from (x0, 0) to (x1, 0) sagging `sag` px. */
function swagBeads(x0: number, x1: number, sag: number, count: number) {
  const mx = (x0 + x1) / 2;
  const beads: { x: number; y: number; leaf: boolean; angle: number }[] = [];
  for (let j = 0; j < count; j++) {
    const u = (j + 0.5) / count;
    // Quadratic Bezier with control point (mx, 2·sag): the curve's lowest point is at y = sag.
    const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1;
    const y = 2 * (1 - u) * u * (2 * sag);
    const dx = 2 * (1 - u) * (mx - x0) + 2 * u * (x1 - mx);
    const dy = 2 * (1 - u) * (2 * sag) + 2 * u * (-2 * sag);
    beads.push({ x, y, leaf: j % 2 === 1, angle: Math.atan2(dy, dx) });
  }
  return beads;
}

function Swags({ t, w }: { t: SharedValue<number>; w: number }) {
  const swags = 3;
  const sag = 58;
  const { thread, beads, tassels } = useMemo(() => {
    const sw = w / swags;
    const b = Skia.PathBuilder.Make();
    let all: ReturnType<typeof swagBeads> = [];
    for (let i = 0; i < swags; i++) {
      const x0 = i * sw;
      const x1 = (i + 1) * sw;
      b.moveTo(x0, 0).quadTo((x0 + x1) / 2, 2 * sag, x1, 0);
      all = all.concat(swagBeads(x0, x1, sag, 9));
    }
    const ts: { x: number; y: number }[] = [];
    for (let i = 1; i < swags; i++) for (let k = 0; k < 3; k++) ts.push({ x: i * sw, y: 10 + k * 15 });
    return { thread: b.build(), beads: all, tassels: ts };
  }, [w]);
  // Drops in from above with a bounce, then sways gently.
  const transform = useDerivedValue(() => {
    const drop = backOut(step(t.value, 200, 750));
    return [{ translateY: (drop - 1) * 150 }, { translateX: 2.5 * Math.sin(t.value / 520) }];
  });
  return (
    <Group transform={transform}>
      <Rect x={0} y={0} width={w} height={5} color={MAROON} />
      <Path path={thread} style="stroke" strokeWidth={3} color={MAROON} />
      {beads.map((b, i) =>
        b.leaf ? (
          <Group key={i} origin={vec(b.x, b.y)} transform={[{ rotate: b.angle + Math.PI / 2 }]}>
            <Oval x={b.x - 4.5} y={b.y - 2} width={9} height={18} color={LEAF} />
          </Group>
        ) : (
          <Group key={i}>
            <Circle cx={b.x} cy={b.y} r={9} color={MARIGOLD} />
            <Circle cx={b.x} cy={b.y} r={9} color="#D9830B" style="stroke" strokeWidth={1.5} />
            <Circle cx={b.x} cy={b.y} r={3.2} color="#C2410C" />
          </Group>
        ),
      )}
      {tassels.map((p, i) => (
        <Circle key={`t${i}`} cx={p.x} cy={p.y} r={i % 3 === 2 ? 5 : 7} color={i % 3 === 1 ? '#FFFFFF' : MARIGOLD} />
      ))}
    </Group>
  );
}

function BottomBorder({ t, w, h }: { t: SharedValue<number>; w: number; h: number }) {
  const base = h - 22;
  const { scallops, dots } = useMemo(() => {
    const n = Math.ceil(w / 36);
    const b = Skia.PathBuilder.Make().moveTo(0, base);
    const d = Skia.PathBuilder.Make();
    for (let i = 0; i < n; i++) {
      const x = i * 36;
      b.quadTo(x + 18, base - 30, x + 36, base);
      d.addCircle(x + 18, base - 26, 2.6);
    }
    return { scallops: b.build(), dots: d.build() };
  }, [w, base]);
  const band = useDerivedValue(() => [{ translateY: (1 - easeOut(step(t.value, 300, 450))) * 30 }]);
  const lineEnd = useDerivedValue(() => easeOut(step(t.value, 550, 800)));
  const dotsEnd = useDerivedValue(() => step(t.value, 900, 600));
  return (
    <Group>
      <Group transform={band}>
        <Rect x={0} y={base} width={w} height={h - base + 30} color={MAROON} />
      </Group>
      <Path path={scallops} style="stroke" strokeWidth={3} strokeCap="round" color={MAROON} start={0} end={lineEnd} />
      <Path path={dots} color={MAROON} start={0} end={dotsEnd} />
    </Group>
  );
}

function CoinLight({ t, x, y }: { t: SharedValue<number>; x: number; y: number }) {
  // A flash as the coin comes out, then a soft glow that stays behind it.
  const flashR = useDerivedValue(() => 20 + easeOut(step(t.value, 950, 500)) * 170);
  const flashOpacity = useDerivedValue(() => {
    const p = step(t.value, 950, 500);
    return p <= 0 ? 0 : 0.75 * (1 - p);
  });
  const glow = useDerivedValue(() => step(t.value, 980, 300) * (0.85 + 0.15 * Math.sin(t.value / 300)));
  return (
    <>
      <Group opacity={glow}>
        <Circle cx={x} cy={y} r={110}>
          <RadialGradient c={vec(x, y)} r={110} colors={['#FFFFFFDD', '#FFF3C400']} />
        </Circle>
      </Group>
      <Circle cx={x} cy={y} r={flashR} color="#FFFFFF" opacity={flashOpacity}>
        <BlurMask blur={18} style="normal" />
      </Circle>
    </>
  );
}

// ---- front layer -----------------------------------------------------------

const PETAL_COLORS = ['#FFB627', '#FF8F1F', '#FFE3A3', '#FFFFFF', MAROON, LEAF];

function Petal({ t, i, w, h }: { t: SharedValue<number>; i: number; w: number; h: number }) {
  const p = useMemo(() => {
    const leaf = i % 6 === 5;
    return {
      x0: rand(i, 1) * w,
      // Spread over the upper screen and just above it, so the shower fills the screen at once.
      y0: -40 + (rand(i, 2) - 0.5) * h * 0.8,
      speed: 0.14 + rand(i, 3) * 0.13,
      amp: 10 + rand(i, 4) * 22,
      phase: rand(i, 5) * Math.PI * 2,
      spin: (rand(i, 6) - 0.5) * 0.008,
      w: leaf ? 7 : 9 + rand(i, 7) * 6,
      h: leaf ? 16 : 6 + rand(i, 8) * 5,
      color: leaf ? LEAF : PETAL_COLORS[i % 5]!,
      fadeIn: rand(i, 9) * 250,
    };
  }, [i, w, h]);
  const start = 750;
  const opacity = useDerivedValue(() => step(t.value, start + p.fadeIn, 300));
  const transform = useDerivedValue(() => {
    const el = t.value - start;
    if (el < 0) return [{ translateX: -100 }, { translateY: -100 }];
    const fallen = p.y0 + el * p.speed;
    // Wrap round once off the bottom, so the shower keeps going while the app finishes loading.
    const y = fallen > h + 30 ? ((fallen - (h + 30)) % (h + 60)) - 30 : fallen;
    const x = p.x0 + p.amp * Math.sin(el / 650 + p.phase);
    return [{ translateX: x }, { translateY: y }, { rotate: p.phase + el * p.spin }];
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <Oval x={-p.w / 2} y={-p.h / 2} width={p.w} height={p.h} color={p.color} />
    </Group>
  );
}

function Sparkle({ t, i, w, h }: { t: SharedValue<number>; i: number; w: number; h: number }) {
  const s = useMemo(() => ({ x: 20 + rand(i, 11) * (w - 40), y: 60 + rand(i, 12) * (h - 160), phase: rand(i, 13) * Math.PI * 2, size: 0.7 + rand(i, 14) * 0.8 }), [i, w, h]);
  const star = useMemo(() => {
    const r = 10;
    const k = 2.4;
    return Skia.PathBuilder.Make()
      .moveTo(0, -r)
      .quadTo(k, -k, r, 0)
      .quadTo(k, k, 0, r)
      .quadTo(-k, k, -r, 0)
      .quadTo(-k, -k, 0, -r)
      .close()
      .build();
  }, []);
  const transform = useDerivedValue(() => {
    const on = step(t.value, 1000 + i * 40, 200);
    const pulse = Math.max(0, Math.sin(t.value / 380 + s.phase));
    return [{ translateX: s.x }, { translateY: s.y }, { scale: Math.max(0.001, on * pulse * s.size) }];
  });
  return (
    <Group transform={transform}>
      <Path path={star} color="#FFFFFF" />
    </Group>
  );
}

export default function SplashSkia({ layer, width: w, height: h, cx, cy, coinX, coinY, still }: SplashSkiaProps) {
  const t = useTime(still);
  if (layer === 'front') {
    return (
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 16 }, (_, i) => (
          <Sparkle key={`s${i}`} t={t} i={i} w={w} h={h} />
        ))}
        {Array.from({ length: 40 }, (_, i) => (
          <Petal key={i} t={t} i={i} w={w} h={h} />
        ))}
      </Canvas>
    );
  }
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Sunrise t={t} w={w} h={h} cx={cx} cy={cy} />
      <Rays t={t} w={w} h={h} cx={cx} cy={cy} />
      <Rangoli t={t} cx={cx} cy={cy} />
      <CoinLight t={t} x={coinX} y={coinY} />
      <BottomBorder t={t} w={w} h={h} />
      <Swags t={t} w={w} />
    </Canvas>
  );
}
