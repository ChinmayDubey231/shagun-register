import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/**
 * In the browser preview, Skia's CanvasKit (WebAssembly) has to load and compile first, which
 * briefly blocks the page. The splash waits on plain marigold until it is ready, so the
 * animation never runs during the freeze.
 */
let loading: Promise<void> | null = null;
export const loadScene = (): Promise<void> => (loading ??= LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }));
