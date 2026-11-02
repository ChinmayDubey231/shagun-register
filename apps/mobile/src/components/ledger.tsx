import { Feather } from '@expo/vector-icons';
import { formatINR } from '@shagun/shared';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSyncStatus } from '@/lib/sync';
import { Pressable, StyleSheet, View } from 'react-native';
import type { EntryListItem, EventSummary, PersonSummary } from '@/db/ledger';
import { dateBadgeParts, formatDate, formatTime, initials, todayISO } from '@/lib/format';
import { colors, directionColors, radius, space } from '@/theme';
import { AppText } from './AppText';

type Direction = 'received' | 'given';

const ARROW_ICONS: Record<string, ComponentProps<typeof Feather>['name']> = {
  '↗': directionColors.given.icon,
  '↙': directionColors.received.icon,
};

/**
 * Puts icon arrows in place of ↗ / ↙ in a line of text, at the text's size. Mukta has no
 * arrows, and Android draws them from a fallback font at about half size, too small to
 * carry the direction they stand for.
 */
export function withArrows(text: string, size: number): ReactNode[] {
  return text
    .split(/([↗↙])/)
    .filter(Boolean)
    .map((part, i) => {
      const icon = ARROW_ICONS[part];
      return icon ? <Feather key={i} name={icon} size={size} /> : part;
    });
}

/**
 * A person's ↗ given over ↙ received. A side with nothing in it is left out rather than shown
 * as a dash (one amount then centres beside the name), and someone with neither says so quietly.
 */
export function GiveTake({ given, received }: { given: number; received: number }) {
  const { t } = useTranslation();
  return (
    <View style={{ alignItems: 'flex-end' }}>
      {given ? (
        <AppText variant="caption" weight="bold" color={colors.given} tabular>
          {withArrows(`↗ ${formatINR(given)}`, 13)}
        </AppText>
      ) : null}
      {received ? (
        <AppText variant="caption" weight="bold" color={colors.received} tabular>
          {withArrows(`↙ ${formatINR(received)}`, 13)}
        </AppText>
      ) : null}
      {!given && !received ? (
        <AppText variant="caption" color={colors.inkSubtle}>
          {t('people.noGifts')}
        </AppText>
      ) : null}
    </View>
  );
}

/** GiveTake for a screen reader: "you gave ₹3,200, they gave ₹4,300", leaving out an empty side. */
export function giveTakeLabel(t: ReturnType<typeof useTranslation>['t'], given: number, received: number): string {
  const parts = [
    given ? `${t('direction.youGave')} ${formatINR(given)}` : null,
    received ? `${t('direction.theyGave')} ${formatINR(received)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : t('people.noGifts');
}

/** ↙ / ↗ tile. Direction is shown by the arrow and the colour, never colour alone. */
export function DirectionTile({ direction, size = 40 }: { direction: Direction; size?: number }) {
  const c = directionColors[direction];
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[styles.tile, { width: size, height: size, backgroundColor: c.bg }]}
    >
      <Feather name={c.icon} size={size * 0.5} color={c.fg} />
    </View>
  );
}

const avatarTones = [
  [colors.sindoorTint, colors.sindoor],
  [colors.receivedTint, colors.received],
  [colors.marigoldTint, colors.marigoldInk],
  [colors.successTint, colors.success],
] as const;

export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = avatarTones[hash % avatarTones.length]!;
  return (
    <View
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: size, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <AppText variant="label" weight="extrabold" color={fg} style={{ fontSize: size * 0.36, lineHeight: size * 0.5 }}>
        {initials(name)}
      </AppText>
    </View>
  );
}

export function DateBadge({ iso, tone }: { iso: string; tone: 'received' | 'given' | 'upcoming' }) {
  const { mon, day } = dateBadgeParts(iso);
  const c =
    tone === 'upcoming'
      ? { bg: colors.marigoldTint, fg: colors.marigoldInk }
      : { bg: directionColors[tone].bg, fg: directionColors[tone].fg };
  return (
    <View importantForAccessibility="no" style={[styles.dateBadge, { backgroundColor: c.bg }]}>
      <AppText variant="tiny" color={c.fg} style={{ fontSize: 11, lineHeight: 13 }}>
        {mon}
      </AppText>
      <AppText variant="section" weight="extrabold" color={c.fg} style={{ fontSize: 20, lineHeight: 24 }}>
        {day}
      </AppText>
    </View>
  );
}

/** Small "Pending / Synced" marker shown under each entry amount. */
export function SyncMark({ pending }: { pending: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.syncMark}>
      <Feather name={pending ? 'clock' : 'check'} size={12} color={pending ? colors.marigoldInk : colors.success} />
      <AppText variant="tiny" color={pending ? colors.marigoldInk : colors.success}>
        {pending ? t('sync.pending') : t('sync.synced')}
      </AppText>
    </View>
  );
}

/**
 * Saving never waits for the network, so sync status only says where the changes are:
 * going up now, waiting on this phone, or all on the server.
 */
function useSyncLabel(pendingCount: number) {
  const { t } = useTranslation();
  const state = useSyncStatus((s) => s.state);
  const waiting = pendingCount > 0;
  const syncing = state === 'syncing' && waiting;
  const offline = state === 'offline' && waiting;
  const icon = syncing ? 'refresh-cw' : offline ? 'wifi-off' : waiting ? 'smartphone' : 'check';
  const label = syncing
    ? t('sync.syncing')
    : offline
      ? t('sync.offlineShort', { count: pendingCount })
      : waiting
        ? t('sync.pendingShort', { count: pendingCount })
        : t('sync.allSaved');
  const long = syncing ? t('sync.syncing') : waiting ? t('sync.pendingLong', { count: pendingCount }) : t('sync.allSaved');
  return { waiting, icon, label, long } as const;
}

/**
 * Home header status, set like the "Family ledger" label it faces: quiet once everything
 * is on the server, marigold while changes wait on this phone.
 */
export function SyncStatus({ pendingCount }: { pendingCount: number }) {
  const { waiting, icon, label, long } = useSyncLabel(pendingCount);
  const color = waiting ? colors.marigoldInk : colors.success;
  return (
    <View accessibilityRole="text" accessibilityLabel={long} style={styles.status}>
      <Feather name={icon} size={12} color={color} />
      <AppText variant="eyebrow" color={color}>
        {label}
      </AppText>
    </View>
  );
}

/** Pill version of the sync status, for list rows. */
export function SyncPill({ pendingCount }: { pendingCount: number }) {
  const { waiting, icon, label, long } = useSyncLabel(pendingCount);
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={long}
      style={[styles.pill, { backgroundColor: waiting ? colors.marigoldTint : colors.successTint }]}
    >
      <Feather name={icon} size={14} color={waiting ? colors.marigoldInk : colors.success} />
      <AppText variant="tiny" color={waiting ? colors.marigoldInk : colors.success} style={{ fontSize: 13 }}>
        {label}
      </AppText>
    </View>
  );
}

export function EntryRow({ item, onLongPress, onPress }: { item: EntryListItem; onLongPress?: () => void; onPress?: () => void }) {
  const { t } = useTranslation();
  const c = directionColors[item.direction];
  const meta = [
    item.relation ? t(`relation.${item.relation}` as 'relation.friend', { defaultValue: item.relation }) : null,
    item.mode === 'item' ? (item.itemNote ?? t('mode.item')) : t(`mode.${item.mode}`),
    item.subFunction ? t(`subFunction.${item.subFunction}` as 'subFunction.haldi', { defaultValue: item.subFunction }) : null,
    formatTime(item.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');
  const amountText = item.mode === 'item' && item.amount === 0 ? t('mode.item') : formatINR(item.amount);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${item.personName}, ${t(`direction.${item.direction}`)} ${amountText}, ${meta}`}
      style={({ pressed }) => [styles.entryRow, pressed && { backgroundColor: colors.ground }]}
    >
      <DirectionTile direction={item.direction} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong" weight="bold" numberOfLines={1}>
          {item.personName}
        </AppText>
        <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
          {meta}
        </AppText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <AppText variant="rowTitle" weight="extrabold" color={c.fg} tabular>
          {amountText}
        </AppText>
        <SyncMark pending={item.pending} />
      </View>
    </Pressable>
  );
}

/** A person and what went each way, for the merge screens: name, city · relation · phone, ↗ given, ↙ received. */
export function PersonTotals({ person }: { person: PersonSummary }) {
  const { t } = useTranslation();
  const sub = [
    person.city,
    person.relation ? t(`relation.${person.relation}` as 'relation.friend', { defaultValue: person.relation }) : null,
    person.phone,
  ]
    .filter(Boolean)
    .join(' · ');
  const exchanges = t('merge.exchanges', { count: person.exchanges });
  return (
    <View
      accessible
      accessibilityLabel={[person.displayName, sub, exchanges, giveTakeLabel(t, person.given, person.received)].filter(Boolean).join(', ')}
      style={styles.personTotals}
    >
      <Avatar name={person.displayName} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong" weight="bold" numberOfLines={1}>
          {person.displayName}
        </AppText>
        <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
          {[sub, exchanges].filter(Boolean).join(' · ')}
        </AppText>
      </View>
      <GiveTake given={person.given} received={person.received} />
    </View>
  );
}

export function EventCard({ event, upcoming, onPress }: { event: EventSummary; upcoming: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const direction: Direction = event.role === 'hosted' ? 'received' : 'given';
  const total = direction === 'received' ? event.received : event.given;
  const meta = [
    event.role === 'attended' && event.hostName ? event.hostName : t(`eventRole.${event.role}`),
    formatDate(event.date),
    event.venue,
  ]
    .filter(Boolean)
    .join(' · ');
  const hasEntries = event.entryCount > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${meta}, ${hasEntries ? `${formatINR(total)} ${t(`direction.${direction}Short`)}` : t('events.nothingLogged')}`}
      onPress={onPress}
      style={({ pressed }) => [styles.eventCard, pressed && { backgroundColor: colors.ground }]}
    >
      <View style={styles.eventTop}>
        <DateBadge iso={event.date} tone={upcoming ? 'upcoming' : direction} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="rowTitle" numberOfLines={2}>
            {event.title}
          </AppText>
          <AppText variant="meta" color={colors.inkMuted} numberOfLines={1}>
            {meta}
          </AppText>
        </View>
        {upcoming ? (
          <View style={styles.upcomingTag}>
            <AppText variant="tiny" color={colors.marigoldInk}>
              {event.date === todayISO() ? t('events.today') : t('events.upcoming')}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.eventBottom}>
        <AppText variant="meta" color={colors.inkMuted}>
          {hasEntries ? t('events.entries', { count: event.entryCount }) : t('events.nothingLogged')}
        </AppText>
        {hasEntries ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name={directionColors[direction].icon} size={16} color={directionColors[direction].fg} />
            <AppText variant="bodyStrong" weight="extrabold" color={directionColors[direction].fg} tabular>
              {formatINR(total)}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dateBadge: { width: 50, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  syncMark: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 14,
    paddingVertical: space.md,
    minHeight: 64,
    backgroundColor: colors.surface,
  },
  personTotals: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 14, paddingVertical: space.md, minHeight: 64 },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: 10,
  },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  eventBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.ground,
    paddingTop: 10,
  },
  upcomingTag: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.marigoldTint,
    justifyContent: 'center',
  },
});
