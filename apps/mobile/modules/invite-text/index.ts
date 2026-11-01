import { requireOptionalNativeModule } from 'expo';

/** One line of text ML Kit found, with its box on the photo (pixels). */
export interface RecognizedLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** 0–1, how sure the recognizer is of this line. */
  confidence: number;
}

export interface RecognizedText {
  latin: RecognizedLine[];
  devanagari: RecognizedLine[];
}

interface InviteTextModule {
  recognize(uri: string): Promise<RecognizedText>;
}

/**
 * The on-device text recognizer, or null where it isn't built in: Expo Go, web and iOS.
 * Android development and release builds include it.
 */
export const InviteText = requireOptionalNativeModule<InviteTextModule>('InviteText');
