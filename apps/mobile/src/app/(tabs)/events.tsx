import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Choice';
import { EmptyState, TabHeading } from '@/components/layout';
import { EventCard } from '@/components/ledger';
import { getDb } from '@/db/client';
import { getEventSummaries } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { todayISO } from '@/lib/format';
import { useCanEdit, useFamilyId } from '@/store/session';
import { colors, radius, space } from '@/theme';
import { useSyncRefresh } from '@/lib/useSyncRefresh';

type Filter = 'all' | 'received' | 'given';

export default function EventsScreen() {
  const refreshControl = useSyncRefresh();
  const { t } = useTranslation();
  const router = useRouter();
  const familyId = useFamilyId();
  const canEdit = useCanEdit();
  const [filter, setFilter] = useState<Filter>('all');
  const events = useDbQuery(() => getEventSummaries(getDb(), familyId), ['events', 'entries', 'people'], [familyId]);
  const today = todayISO();

  const sections = useMemo(() => {
    const shown = events.filter(
      (e) => filter === 'all' || (filter === 'received' ? e.role === 'hosted' : e.role === 'attended'),
    );
    const byYear = new Map<string, typeof shown>();
    for (const e of shown) {
      const year = e.date.slice(0, 4);
      byYear.set(year, [...(byYear.get(year) ?? []), e]);
    }
    return [...byYear.entries()].map(([title, data]) => ({ title, data }));
  }, [events, filter]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <TabHeading title={t('events.title')} meta={events.length > 0 ? t('events.count', { count: events.length }) : undefined} />
        <Segmented<Filter>
          label={t('events.show')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('events.all') },
            { value: 'received', label: t('events.received') },
            { value: 'given', label: t('events.given') },
          ]}
        />
      </View>
      <SectionList
        refreshControl={refreshControl}
        style={{ backgroundColor: colors.ground }}
        contentContainerStyle={styles.list}
        sections={sections}
        keyExtractor={(e) => e.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <AppText variant="label" weight="bold" color={colors.inkMuted} style={styles.year}>
            {section.title}
          </AppText>
        )}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 10 }}>
            <EventCard
              event={item}
              upcoming={item.date >= today}
              onPress={() => router.push({ pathname: '/events/[id]', params: { id: item.id } })}
            />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="calendar"
            title={t('events.emptyTitle')}
            body={t('events.emptyBody')}
            action={canEdit ? <Button label={t('home.newEvent')} icon="plus" onPress={() => router.push('/events/new')} style={{ alignSelf: 'stretch', marginTop: space.md }} /> : undefined}
          />
        }
      />
      {events.length > 0 && canEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.newEvent')}
          onPress={() => router.push('/events/new')}
          style={({ pressed }) => [styles.fab, { backgroundColor: pressed ? colors.sindoorDark : colors.sindoor }]}
        >
          <Feather name="plus" size={22} color={colors.surface} />
          <AppText variant="rowTitle" color={colors.surface}>
            {t('home.newEvent')}
          </AppText>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  list: { paddingHorizontal: space.xl, paddingBottom: 110, flexGrow: 1 },
  year: { marginTop: space.lg, marginBottom: space.sm },
  fab: {
    position: 'absolute',
    right: space.xl,
    bottom: space.xl,
    height: 56,
    paddingLeft: space.lg,
    paddingRight: space.xl,
    borderRadius: radius.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    elevation: 4,
    shadowColor: colors.sindoor,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
});
