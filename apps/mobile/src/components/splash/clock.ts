/**
 * The opening splash's one clock: how many milliseconds of the animation have played.
 *
 * It is advanced on the UI thread every frame, so the JavaScript thread, busy loading the app
 * underneath, can't hold the choreography up. Everything in the splash is drawn from it: the Skia
 * layers and the lifafa, coin and name alike, so they stay in step.
 *
 * A long frame (the first draw of a canvas, say) moves it on by at most MAX_STEP. A hitch then
 * pauses the animation for a moment instead of skipping part of it.
 */
import { useCallback } from 'react';
import { useFrameCallback, useSharedValue, type FrameInfo } from 'react-native-reanimated';

/** The longest one frame may move the clock on: a 20 fps frame still plays in real time. */
const MAX_STEP = 50;

/** The frame shown, held still, when motion is reduced: after everything has landed. */
export const STILL_T = 2100;

/** `t` starts at 0 and stays there until `frames.setActive(true)`. */
export function useSplashClock() {
  const t = useSharedValue(0);
  const tick = useCallback(
    (frame: FrameInfo) => {
      'worklet';
      t.value += Math.min(frame.timeSincePreviousFrame ?? 0, MAX_STEP);
    },
    [t],
  );
  const frames = useFrameCallback(tick, false);
  return { t, frames };
}

export const clamp01 = (x: number) => {
  'worklet';
  return Math.min(1, Math.max(0, x));
};

/** Progress of a step that starts at `start` ms and lasts `dur` ms. */
export const step = (t: number, start: number, dur: number) => {
  'worklet';
  return clamp01((t - start) / dur);
};
