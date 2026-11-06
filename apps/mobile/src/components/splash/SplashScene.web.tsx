import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { SplashSkiaProps } from './SplashSkia';

/**
 * In the browser preview Skia runs on CanvasKit (WebAssembly), which loads first.
 * `npx setup-skia-web public` copies canvaskit.wasm into public/ once.
 */
export function SplashScene(props: SplashSkiaProps) {
  return (
    <WithSkiaWeb
      getComponent={() => import('./SplashSkia')}
      componentProps={props}
      opts={{ locateFile: (file: string) => `/${file}` }}
      fallback={null}
    />
  );
}
