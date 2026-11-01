import { Feather } from '@expo/vector-icons';
import { formatINR, sumAmounts } from '@shagun/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Segmented } from '@/components/Choice';
import { EmptyState, IconButton, ScreenHeader } from '@/components/layout';
import { Avatar, DateBadge } from '@/components/ledger';
import { getDb } from '@/db/client';
import { getKeptPerson, getPersonHistory, getUpcomingForPerson } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { formatDate, formatMonthYear, todayISO } from '@/lib/format';
import { useCanEdit, useFamilyId } from '@/store/session';
import { colors, directionColors, radius, space } from '@/theme';
import { useSyncRefresh } from '@/lib/useSyncRefresh';

type Filter = 'all' | 'given' | 'received';

/** Every gift both ways with one person or household: the reason the app exists. */
export default function PersonHistoryScreen() {
  const refreshControl = useSyncRefresh();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const familyId = useFamilyId();
  const canEdit = useCanEdit();
  const [filter, setFilter] = useState<Filter>('all');
  // A link to a merged duplicate opens the person it was merged into.
  const person = useDbQuery(() => getKeptPerson(getDb(), familyId, params.id), ['people'], [familyId, params.id]);
  const id = person?.id ?? params.id;
  const history = useDbQuery(() => getPersonHistory(getDb(), id), ['entries', 'events'], [id]);
  const upcoming = useDbQuery(() => getUpcomingForPerson(getDb(), familyId, id, todayISO()), ['events'], [familyId, id]);

  if (!person) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader />
        <EmptyState icon="user-x" title={t('person.notFound')} />
      </SafeAreaView>
    );
  }

  const given = history.filter((h) => h.direction === 'given');
  const received = history.filter((h) => h.direction === 'received');
  const shown = filter === 'all' ? history : filter === 'given' ? given : received;
  const firstYear = history.length ? history[history.length - 1]!.eventDate.slice(0, 4) : null;
  const lastDate = history[0]?.eventDate;
  const lastReceived = received[0];
  const next = upcoming[0];
  const sub = [
    person.nameDevanagari && person.nameDevanagari !== person.displayName ? person.nameDevanagari : null,
    person.city,
    person.relation ? t(`relation.${person.relation}` as 'relation.friend', { defaultValue: person.relation }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScreenHeader
        right={
          !canEdit ? undefined : (
            <View style={styles.actions}>
              <IconButton icon="git-merge" label={t('merge.fromPerson')} onPress={() => router.push({ pathname: '/people/merge', params: { a: id } })} />
              <IconButton icon="edit-2" label={t('person.edit')} onPress={() => router.push({ pathname: '/people/[id]/edit', params: { id } })} />
            </View>
          )
        }
      />
      <FlatList
        refreshControl={refreshControl}
        style={{ backgroundColor: colors.ground }}
        data={shown}
        keyExtractor={(h) => h.id}
        ListHeaderComponent={
          <>
            <View style={styles.head}>
              <View style={styles.who}>
                <Avatar name={person.displayName} size={60} />
                <View style={{ flex: 1 }}>
                  <AppText variant="title" style={{ fontSize: 24, lineHeight: 30 }} accessibilityRole="header">
                    {person.displayName}
                  </AppText>
                  {sub ? (
                    <AppText variant="meta" color={colors.inkMuted}>
                      {sub}
                    </AppText>
                  ) : null}
                  {person.phone ? (
                    <AppText variant="caption" color={colors.inkMuted}>
                      {person.phone}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <View style={styles.totals}>
                <View style={[styles.totalBox, { backgroundColor: colors.givenTint }]}>
                  <AppText variant="caption" weight="bold" color={colors.given}>
                    {t('person.youGave', { count: given.length })}
                  </AppText>
                  <AppText variant="title" style={{ fontSize: 24, lineHeight: 30 }} color={colors.given} tabular>
                    {formatINR(sumAmounts(given.map((g) => g.amount)))}
                  </AppText>
                </View>
                <View style={[styles.totalBox, { backgroundColor: colors.receivedTint }]}>
                  <AppText variant="caption" weight="bold" color={colors.received}>
                    {t('person.theyGave', { count: received.length })}
                  </AppText>
                  <AppText variant="title" style={{ fontSize: 24, lineHeight: 30 }} color={colors.received} tabular>
                    {formatINR(sumAmounts(received.map((r) => r.amount)))}
                  </AppText>
                </View>
              </View>
              {firstYear && lastDate ? (
                <AppText variant="meta" color={colors.inkMuted}>
                  {t('person.sinceLast', { count: history.length, year: firstYear, last: formatMonthYear(lastDate) })}
                </AppText>
              ) : null}
            </View>

            <View style={styles.body}>
              {next && canEdit ? (
                <View style={styles.upcoming}>
                  <View style={styles.upcomingTop}>
                    <View style={styles.upcomingBadge}>
                      <DateBadge iso={next.date} tone="upcoming" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="rowTitle" color={colors.surface}>
                        {t('person.upcoming', { title: next.title })}
                      </AppText>
                      <AppText variant="meta" color={colors.onSindoorMuted}>
                        {lastReceived
                          ? t('person.theyGaveAt', {
                              amount: lastReceived.mode === 'item' && !lastReceived.amount ? t('mode.item') : formatINR(lastReceived.amount),
                              event: lastReceived.eventTitle,
                            })
                          : formatDate(next.date)}
                      </AppText>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('eventDetail.logGiven')}
                    onPress={() => router.push({ pathname: '/events/[id]/entry', params: { id: next.id } })}
                    style={({ pressed }) => [styles.upcomingButton, pressed && { backgroundColor: colors.sindoorTint }]}
                  >
                    <Feather name="arrow-up-right" size={18} color={colors.sindoor} />
                    <AppText variant="bodyStrong" weight="bold" color={colors.sindoor}>
                      {t('eventDetail.logGiven')}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}

              {history.length > 0 ? (
                <Segmented<Filter>
                  label={t('person.show')}
                  value={filter}
                  onChange={setFilter}
                  style={{ backgroundColor: '#E6E8EC' }}
                  options={[
                    { value: 'all', label: t('person.filterAll', { count: history.length }) },
                    { value: 'given', label: t('person.filterGiven', { count: given.length }) },
                    { value: 'received', label: t('person.filterReceived', { count: received.length }) },
                  ]}
                />
              ) : null}
            </View>
          </>
        }
        contentContainerStyle={{ paddingBottom: space.xxxl, flexGrow: 1 }}
        ListEmptyComponent={history.length === 0 ? <EmptyState icon="repeat" title={t('person.emptyTitle')} /> : undefined}
        renderItem={({ item, index }) => {
          const c = directionColors[item.direction];
          const amount = item.mode === 'item' && !item.amount ? t('mode.item') : formatINR(item.amount);
          return (
            <View style={styles.timelineRow}>
              <View style={styles.rail} importantForAccessibility="no">
                <View style={[styles.dot, { backgroundColor: c.fg }]} />
                {index < shown.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatDate(item.eventDate)}, ${item.eventTitle}, ${item.direction === 'given' ? t('direction.youGave') : t('direction.theyGave')} ${amount}`}
                onPress={() => router.push({ pathname: '/events/[id]', params: { id: item.eventId } })}
                style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.ground }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="caption" weight="bold" color={colors.inkMuted}>
                    {formatDate(item.eventDate)}
                  </AppText>
                  <AppText variant="bodyStrong" weight="bold">
                    {item.eventTitle}
                  </AppText>
                  <AppText variant="caption" color={colors.inkMuted}>
                    {[
                      item.eventRole === 'hosted' ? t('person.ourFunction') : t('person.theirFunction'),
                      item.mode === 'item' ? (item.itemNote ?? t('mode.item')) : t(`mode.${item.mode}`),
                    ].join(' · ')}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="rowTitle" weight="extrabold" color={c.fg} tabular>
                    {amount}
                  </AppText>
                  <AppText variant="tiny" color={c.fg}>
                    {item.direction === 'given' ? `↗ ${t('direction.youGave')}` : `↙ ${t('direction.theyGave')}`}
                  </AppText>
                </View>
              </Pressable>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
  head: {
    paddingHorizontal: space.xl,
    paddingBottom: space.lg,
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  totals: { flexDirection: 'row', gap: 10 },
  totalBox: { flex: 1, borderRadius: 14, paddingHorizontal: space.md, paddingVertical: 10 },
  body: { padding: space.xl, paddingBottom: space.md, gap: space.md },
  upcoming: { borderRadius: radius.card, backgroundColor: colors.sindoor, padding: space.lg, gap: space.md },
  upcomingTop: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  upcomingBadge: { borderRadius: 12, backgroundColor: colors.surface },
  upcomingButton: {
    minHeight: 44,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  timelineRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl },
  rail: { width: 20, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 20 },
  line: { flex: 1, width: 2, backgroundColor: colors.lineStrong },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: space.md,
  },
});
