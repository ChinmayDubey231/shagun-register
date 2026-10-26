import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts, type as typeScale, type TypeVariant } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  weight?: keyof typeof fonts;
  align?: TextStyle['textAlign'];
  /** Tabular digits for amounts so columns line up. */
  tabular?: boolean;
}

export function AppText({ variant = 'body', color = colors.ink, weight, align, tabular, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        typeScale[variant],
        { color },
        weight ? { fontFamily: fonts[weight] } : null,
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
