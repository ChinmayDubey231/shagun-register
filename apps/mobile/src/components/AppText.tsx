import { hasDevanagari } from '@shagun/shared';
import { Children, type ReactNode } from 'react';
import { Platform, Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts, type as typeScale, type TypeVariant } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  weight?: keyof typeof fonts;
  align?: TextStyle['textAlign'];
  /** Tabular digits for amounts so columns line up. */
  tabular?: boolean;
}

/** Letter spacing breaks the line along the top of Devanagari words, and 11 px is too small for them. */
const devanagariEyebrow: TextStyle = { letterSpacing: 0, fontSize: 12, lineHeight: 16 };

/**
 * Android measures Devanagari to a fraction of a pixel and then lays a label out in the
 * rounded-down width, so a label sized to its text drops its last word onto a clipped
 * second line ("कार्यक्रम बनाएँ" showed as "कार्यक्रम"). A trailing hair space counts toward the
 * measured width but may hang past the edge, which gives the text the slack it needs.
 */
const HAIR_SPACE = ' ';

const plainText = (children: ReactNode) =>
  Children.toArray(children)
    .filter((c) => typeof c === 'string' || typeof c === 'number')
    .join('');

export function AppText({ variant = 'body', color = colors.ink, weight, align, tabular, style, children, ...rest }: AppTextProps) {
  const devanagari = hasDevanagari(plainText(children));
  return (
    <Text
      {...rest}
      style={[
        typeScale[variant],
        variant === 'eyebrow' && devanagari ? devanagariEyebrow : null,
        { color },
        weight ? { fontFamily: fonts[weight] } : null,
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    >
      {children}
      {devanagari && Platform.OS === 'android' ? HAIR_SPACE : null}
    </Text>
  );
}
