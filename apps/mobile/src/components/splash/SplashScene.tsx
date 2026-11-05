import SplashSkia, { type SplashSkiaProps } from './SplashSkia';

/** On phones Skia is built in, so the scene renders straight away. */
export function SplashScene(props: SplashSkiaProps) {
  return <SplashSkia {...props} />;
}
