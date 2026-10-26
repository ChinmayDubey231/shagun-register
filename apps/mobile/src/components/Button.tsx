import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, touch } from '@/theme';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ComponentProps<typeof Feather>['name'];
  iconRight?: ComponentProps<typeof Feather>['name'];
  disabled?: boolean;
  busy?: boolean;
  size?: 'large' | 'medium';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const palette: Record<Variant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: colors.sindoor, fg: colors.surface, border: colors.sindoor, pressed: colors.sindoorDark },
  secondary: { bg: colors.surface, fg: colors.sindoor, border: colors.sindoor, pressed: colors.sindoorTint },
  quiet: { bg: colors.surface, fg: colors.ink, border: colors.lineStrong, pressed: colors.ground },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.lineStrong, pressed: colors.dangerTint },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  disabled,
  busy,
  size = 'large',
  style,
  accessibilityHint,
}: ButtonProps) {
  const p = palette[variant];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      accessibilityHint={accessibilityHint}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: size === 'large' ? touch.primary : 48 },
        off
          ? { backgroundColor: colors.disabled, borderColor: colors.disabled }
          : { backgroundColor: pressed ? p.pressed : p.bg, borderColor: p.border },
        style,
      ]}
    >
      <View style={styles.row}>
        {busy ? <ActivityIndicator color={p.fg} /> : null}
        {icon && !busy ? <Feather name={icon} size={20} color={off ? colors.inkMuted : p.fg} /> : null}
        <AppText variant="rowTitle" color={off ? colors.inkMuted : p.fg}>
          {label}
        </AppText>
        {iconRight ? <Feather name={iconRight} size={20} color={off ? colors.inkMuted : p.fg} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
