import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, touch } from '@/theme';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Feather>['name'];

/** Round icon-only button with an accessible label. */
export function IconButton({
  icon,
  label,
  onPress,
  color = colors.ink,
  background,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  background?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: pressed ? 'rgba(20,22,28,0.08)' : (background ?? 'transparent') },
      ]}
    >
      <Feather name={icon} size={24} color={color} />
    </Pressable>
  );
}

/** Top bar for pushed screens: back/close, title, optional subtitle and trailing action. */
export function ScreenHeader({
  title,
  subtitle,
  close,
  right,
  tone = 'light',
}: {
  title?: string;
  subtitle?: string;
  close?: boolean;
  right?: ReactNode;
  tone?: 'light' | 'sindoor';
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const fg = tone === 'sindoor' ? colors.surface : colors.ink;
  return (
    <View style={styles.header}>
      <IconButton
        icon={close ? 'x' : 'chevron-left'}
        label={close ? t('common.close') : t('common.back')}
        color={fg}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <AppText variant="caption" weight="semibold" color={tone === 'sindoor' ? colors.onSindoorMuted : colors.inkMuted}>
            {subtitle}
          </AppText>
        ) : null}
        {title ? (
          <AppText variant="section" weight="extrabold" color={fg} numberOfLines={1} accessibilityRole="header">
            {title}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && { padding: space.lg }, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <AppText variant="section" accessibilityRole="header">
        {children}
      </AppText>
      {right}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={28} color={colors.sindoor} />
      </View>
      <AppText variant="rowTitle" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText variant="meta" color={colors.inkMuted} align="center">
          {body}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

/** Rows inside a white rounded list, separated by hairlines. */
export function ListGroup({ children }: { children: ReactNode }) {
  return <View style={styles.listGroup}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  iconButton: {
    width: touch.min,
    height: touch.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xxl },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.sindoorTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  listGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.line },
});
