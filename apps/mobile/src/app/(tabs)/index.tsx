import { Feather } from '@expo/vector-icons';
import { formatINR, simpleNameKey } from '@shagun/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Card, Divider, EmptyState, ListGroup, SectionTitle } from '@/components/layout';
import { Avatar, DateBadge, EventCard, SyncPill } from '@/components/ledger';
import { Button } from '@/components/Button';
import { getDb } from '@/db/client';
import { countPendingChanges, getEventSummaries, getLastExchange, searchPeople, type EventSummary } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { formatDate, todayISO } from '@/lib/format';
import { useCanEdit, useFamilyId, useSession } from '@/store/session';
import { colors, directionColors, fonts, radius, space } from '@/theme';
import { useSyncRefresh } from '@/lib/useSyncRefresh';

export default function HomeScreen() {
  const refreshControl = useSyncRefresh();
  const { t } = useTranslation();
  const router = useRouter();
  const familyId = useFamilyId();
  const familyName = useSession((s) => s.family?.name ?? '');
  const canEdit = useCanEdit();
  const [query, setQuery] = useState('');

  const events = useDbQuery(() => getEventSummaries(getDb(), familyId), ['events', 'entries', 'people'], [familyId]);
  const pending = useDbQuery(() => countPendingChanges(getDb()), ['outbox'], []);

  const today = todayISO();
  const upcoming = useMemo(() => events.filter((e) => e.date >= today).reverse().slice(0, 3), [events, today]);
  const recent = useMemo(() => events.filter((e) => e.date < today).slice(0, 5), [events, today]);

  const searching = query.trim().length > 0;
  const peopleHits = useDbQuery(
    () => (searching ? searchPeople(getDb(), familyId, query, 5) : []),
    ['people', 'entries'],
    [familyId, query, searching],
  );
  const eventHits = useMemo(() => {
    const key = simpleNameKey(query);
    return key ? events.filter((e) => simpleNameKey(e.title).includes(key)).slice(0, 5) : [];
  }, [events, query]);

  const openEvent = (id: string) => router.push({ pathname: '/events/[id]', params: { id } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${familyName}. ${t('switcher.switchA11y')}`}
            onPress={() => router.push('/family/switch')}
            hitSlop={8}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <AppText variant="section" weight="extrabold" style={{ fontSize: 22, lineHeight: 30, flexShrink: 1 }} numberOfLines={1} accessibilityRole="header">
              {familyName}
            </AppText>
            <Feather name="chevron-down" size={20} color={colors.ink} />
          </Pressable>
          <SyncPill pendingCount={pending} />
        </View>
        <View style={styles.search}>
          <Feather name="search" size={20} color={colors.inkMuted} />
          <TextInput
            accessibilityLabel={t('home.search')}
            placeholder={t('home.search')}
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {searching ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setQuery('')} hitSlop={10}>
              <Feather name="x" size={20} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView style={{ backgroundColor: colors.ground }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
        {searching ? (
          <SearchResults
            query={query}
            people={peopleHits}
            events={eventHits}
            onPerson={(id) => router.push({ pathname: '/people/[id]', params: { id } })}
            onEvent={openEvent}
          />
        ) : (
          <>
            {canEdit ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('home.scanInvite')}
                onPress={() => router.push('/scan-invite')}
                style={({ pressed }) => [styles.actionTile, { backgroundColor: pressed ? colors.sindoorDark : colors.sindoor }]}
              >
                <Feather name="camera" size={26} color={colors.surface} />
                <AppText variant="rowTitle" color={colors.surface}>
                  {t('home.scanInvite')}
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('home.newEvent')}
                onPress={() => router.push('/events/new')}
                style={({ pressed }) => [styles.actionTile, styles.actionTileLight, pressed && { backgroundColor: colors.ground }]}
              >
                <Feather name="calendar" size={26} color={colors.sindoor} />
                <AppText variant="rowTitle">{t('home.newEvent')}</AppText>
              </Pressable>
            </View>
            ) : null}

            {events.length === 0 ? (
              <Card>
                <EmptyState
                  icon="book-open"
                  title={t('home.emptyTitle')}
                  body={t('home.emptyBody')}
                  action={canEdit ? <Button label={t('home.newEvent')} icon="plus" onPress={() => router.push('/events/new')} style={{ alignSelf: 'stretch', marginTop: space.md }} /> : undefined}
                />
              </Card>
            ) : null}

            {upcoming.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle>{t('home.upcoming')}</SectionTitle>
                {upcoming.map((e) => (
                  <UpcomingCard key={e.id} event={e} onOpen={() => openEvent(e.id)} />
                ))}
              </View>
            ) : null}

            {recent.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle
                  right={
                    <Pressable accessibilityRole="link" onPress={() => router.push('/events')} hitSlop={10}>
                      <AppText variant="bodyStrong" weight="bold" color={colors.sindoor}>
                        {t('common.seeAll')}
                      </AppText>
                    </Pressable>
                  }
                >
                  {t('home.recent')}
                </SectionTitle>
                {recent.map((e) => (
                  <EventCard key={e.id} event={e} upcoming={false} onPress={() => openEvent(e.id)} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Upcoming event. For another family's function, shows the last exchange with the host and links to history. */
function UpcomingCard({ event, onOpen }: { event: EventSummary; onOpen: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const last = useDbQuery(
    () => (event.hostPersonId ? getLastExchange(getDb(), event.hostPersonId, event.id) : undefined),
    ['entries'],
    [event.hostPersonId, event.id],
  );
  if (event.role === 'hosted' || !event.hostPersonId) {
    return <EventCard event={event} upcoming onPress={onOpen} />;
  }
  const meta = [event.hostName, t(`eventType.${event.type}`), event.venue].filter(Boolean).join(' · ');
  return (
    <Card padded={false}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${event.title}, ${meta}`} onPress={onOpen} style={styles.upcomingTop}>
        <DateBadge iso={event.date} tone="upcoming" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="rowTitle">{event.title}</AppText>
          <AppText variant="meta" color={colors.inkMuted}>
            {meta}
          </AppText>
          {last ? (
            <View style={styles.lastRow}>
              <Feather name={directionColors[last.direction].icon} size={16} color={directionColors[last.direction].fg} />
              <AppText variant="meta" style={{ flex: 1 }}>
                {t('home.last', {
                  who: last.direction === 'given' ? t('direction.youGave') : t('direction.theyGave'),
                  amount: last.mode === 'item' && last.amount === 0 ? t('mode.item') : formatINR(last.amount),
                  date: formatDate(last.eventDate),
                })}
              </AppText>
            </View>
          ) : null}
        </View>
      </Pressable>
      <Divider />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('home.historyWith', { name: event.hostName ?? '' })}
        onPress={() => router.push({ pathname: '/people/[id]', params: { id: event.hostPersonId! } })}
        style={({ pressed }) => [styles.historyLink, pressed && { backgroundColor: colors.ground }]}
      >
        <AppText variant="bodyStrong" weight="bold" color={colors.sindoor}>
          {t('home.historyWith', { name: event.hostName ?? '' })}
        </AppText>
        <Feather name="chevron-right" size={20} color={colors.sindoor} />
      </Pressable>
    </Card>
  );
}

function SearchResults({
  query,
  people,
  events,
  onPerson,
  onEvent,
}: {
  query: string;
  people: ReturnType<typeof searchPeople>;
  events: EventSummary[];
  onPerson: (id: string) => void;
  onEvent: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (people.length === 0 && events.length === 0) {
    return <EmptyState icon="search" title={t('home.noResults', { query: query.trim() })} />;
  }
  return (
    <>
      {people.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle>{t('home.people')}</SectionTitle>
          <ListGroup>
            {people.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={p.displayName}
                  onPress={() => onPerson(p.id)}
                  style={({ pressed }) => [styles.personRow, pressed && { backgroundColor: colors.ground }]}
                >
                  <Avatar name={p.displayName} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" weight="bold">
                      {p.displayName}
                    </AppText>
                    <AppText variant="caption" color={colors.inkMuted}>
                      {[p.city, p.relation ? t(`relation.${p.relation}` as 'relation.friend', { defaultValue: p.relation }) : null]
                        .filter(Boolean)
                        .join(' · ') || ' '}
                    </AppText>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.inkMuted} />
                </Pressable>
              </View>
            ))}
          </ListGroup>
        </View>
      ) : null}
      {events.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle>{t('home.events')}</SectionTitle>
          {events.map((e) => (
            <EventCard key={e.id} event={e} upcoming={e.date >= todayISO()} onPress={() => onEvent(e.id)} />
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, gap: space.md, backgroundColor: colors.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    borderRadius: radius.button,
    backgroundColor: colors.ground,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 17, color: colors.ink, paddingVertical: 0 },
  body: { padding: space.xl, gap: space.xl, paddingBottom: space.xxxl },
  actions: { flexDirection: 'row', gap: space.md },
  actionTile: {
    flex: 1,
    height: 92,
    borderRadius: radius.card,
    padding: 14,
    justifyContent: 'space-between',
  },
  actionTileLight: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  section: { gap: 10 },
  upcomingTop: { flexDirection: 'row', gap: 14, padding: space.lg },
  lastRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: space.lg,
  },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 14, minHeight: 64 },
});
