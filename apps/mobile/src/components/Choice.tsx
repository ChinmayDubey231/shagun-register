import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '@/theme';
import { AppText } from './AppText';

export interface Option<T extends string> {
  value: T;
  label: string;
  sublabel?: string;
  /** Text colour when selected (e.g. blue for Received, orange for Given). */
  accent?: string;
  icon?: 'arrow-down-left' | 'arrow-up-right';
}

/** iOS-style segmented control on a grey track. Single choice. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.track, style]}>
      {options.map((o) => {
        const on = o.value === value;
        const fg = on ? (o.accent ?? colors.ink) : colors.inkMuted;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.sublabel ? `${o.label}, ${o.sublabel}` : o.label}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, o.sublabel ? styles.segmentTall : null, on && styles.segmentOn]}
          >
            <View style={styles.segmentRow}>
              {o.icon ? <Feather name={o.icon} size={18} color={fg} /> : null}
              <AppText variant="bodyStrong" weight={on ? 'bold' : 'semibold'} color={fg}>
                {o.label}
              </AppText>
            </View>
            {o.sublabel ? (
              <AppText variant="tiny" weight="regular" color={on ? colors.ink : colors.inkMuted} align="center">
                {o.sublabel}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pill chip. `tone="marigold"` is used for amount chips and sub-functions. */
export function Chip({
  label,
  selected,
  onPress,
  tone = 'sindoor',
  showCheck,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tone?: 'sindoor' | 'marigold';
  showCheck?: boolean;
  accessibilityLabel?: string;
}) {
  const on =
    tone === 'sindoor'
      ? { bg: colors.sindoor, fg: colors.surface, border: colors.sindoor }
      : { bg: colors.marigoldTint, fg: colors.onMarigold, border: colors.marigold };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: on.bg, borderColor: on.border }
          : { backgroundColor: colors.surface, borderColor: colors.lineStrong },
      ]}
    >
      {showCheck && selected ? <Feather name="check" size={16} color={on.fg} /> : null}
      <AppText variant="bodyStrong" weight={selected ? 'bold' : 'semibold'} color={selected ? on.fg : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** A horizontally scrolling row of chips that bleeds to the screen edge. */
export function ChipRow({ children, gutter = space.xl }: { children: React.ReactNode; gutter?: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -gutter }}
      contentContainerStyle={{ paddingHorizontal: gutter, gap: space.sm }}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.ground,
    borderRadius: radius.button,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentTall: { minHeight: 58, paddingVertical: 4 },
  segmentOn: {
    backgroundColor: colors.surface,
    shadowColor: '#14161C',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
