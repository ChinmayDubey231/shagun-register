import { formatINR, sumAmounts } from '@shagun/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { EmptyState, ScreenHeader } from '@/components/layout';
import { Avatar } from '@/components/ledger';
import { getDb } from '@/db/client';
import { getPerson, getPersonHistory } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { formatDate } from '@/lib/format';
import { useFamilyId } from '@/store/session';
import { colors, directionColors, space } from '@/theme';

/** Every gift both ways with one person or household. Week 2 adds the upcoming-invite card and filters. */
export default function PersonHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const familyId = useFamilyId();
  const person = useDbQuery(() => getPerson(getDb(), familyId, id), ['people'], [familyId, id]);
  const history = useDbQuery(() => getPersonHistory(getDb(), id), ['entries', 'events'], [id]);

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
  const firstYear = history.length ? history[history.length - 1]!.eventDate.slice(0, 4) : null;
  const sub = [
    person.nameDevanagari && person.nameDevanagari !== person.displayName ? person.nameDevanagari : null,
    person.city,
    person.relation ? t(`relation.${person.relation}` as 'relation.friend', { defaultValue: person.relation }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScreenHeader />
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
        {firstYear ? (
          <AppText variant="meta" color={colors.inkMuted}>
            {t('person.since', { count: history.length, year: firstYear })}
          </AppText>
        ) : null}
      </View>

      <FlatList
        style={{ backgroundColor: colors.ground }}
        contentContainerStyle={styles.list}
        data={history}
        keyExtractor={(h) => h.id}
        ListEmptyComponent={<EmptyState icon="repeat" title={t('person.emptyTitle')} />}
        renderItem={({ item, index }) => {
          const c = directionColors[item.direction];
          const amount = item.mode === 'item' && !item.amount ? t('mode.item') : formatINR(item.amount);
          return (
            <View style={styles.timelineRow}>
              <View style={styles.rail} importantForAccessibility="no">
                <View style={[styles.dot, { backgroundColor: c.fg }]} />
                {index < history.length - 1 ? <View style={styles.line} /> : null}
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
  head: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  totals: { flexDirection: 'row', gap: 10 },
  totalBox: { flex: 1, borderRadius: 14, paddingHorizontal: space.md, paddingVertical: 10 },
  list: { padding: space.xl, flexGrow: 1 },
  timelineRow: { flexDirection: 'row', gap: space.md },
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

