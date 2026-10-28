import { Feather } from '@expo/vector-icons';
import { createPersonSearch, formatINR, RELATION_PRESETS } from '@shagun/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Choice';
import { EmptyState } from '@/components/layout';
import { Avatar } from '@/components/ledger';
import { getDb } from '@/db/client';
import { getPeopleSummaries } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { useFamilyId } from '@/store/session';
import { colors, fonts, radius, space } from '@/theme';

export default function PeopleScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const familyId = useFamilyId();
  const [query, setQuery] = useState('');
  const [relation, setRelation] = useState<string | null>(null);
  const people = useDbQuery(() => getPeopleSummaries(getDb(), familyId), ['people', 'entries'], [familyId]);
  const search = useMemo(() => createPersonSearch(people), [people]);

  // Relation filters: the presets in use first, then any custom relations people have.
  const relations = useMemo(() => {
    const used = new Set(people.map((p) => p.relation).filter((r): r is string => !!r));
    const presets: string[] = RELATION_PRESETS.filter((r) => used.has(r));
    return [...presets, ...[...used].filter((r) => !presets.includes(r)).sort()];
  }, [people]);

  const shown = useMemo(() => {
    const base = query.trim() ? search(query, 50) : people;
    return relation ? base.filter((p) => p.relation === relation) : base;
  }, [people, search, query, relation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="title" accessibilityRole="header">
            {t('people.title')}
          </AppText>
          <AppText variant="label" color={colors.inkMuted}>
            {t('people.count', { count: people.length })}
          </AppText>
        </View>
        <View style={styles.search}>
          <Feather name="search" size={20} color={colors.inkMuted} />
          <TextInput
            accessibilityLabel={t('people.search')}
            placeholder={t('people.search')}
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
          />
        </View>
        {relations.length > 0 ? (
          <ChipRow>
            <Chip label={t('events.all')} selected={relation === null} onPress={() => setRelation(null)} />
            {relations.map((r) => (
              <Chip
                key={r}
                label={t(`relation.${r}` as 'relation.friend', { defaultValue: r })}
                selected={relation === r}
                onPress={() => setRelation(relation === r ? null : r)}
              />
            ))}
          </ChipRow>
        ) : null}
      </View>
      <FlatList
        style={{ backgroundColor: colors.ground }}
        contentContainerStyle={styles.list}
        data={shown}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListFooterComponent={
          people.length > 0 ? (
            <AppText variant="caption" color={colors.inkMuted} align="center" style={{ marginTop: space.md }}>
              {t('people.legend')}
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={<EmptyState icon="users" title={t('people.emptyTitle')} body={t('people.emptyBody')} />}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.displayName}, ${t('direction.youGave')} ${formatINR(item.given)}, ${t('direction.theyGave')} ${formatINR(item.received)}`}
            onPress={() => router.push({ pathname: '/people/[id]', params: { id: item.id } })}
            style={({ pressed }) => [
              styles.row,
              index === 0 && styles.first,
              index === shown.length - 1 && styles.last,
              pressed && { backgroundColor: colors.ground },
            ]}
          >
            <Avatar name={item.displayName} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyStrong" weight="bold" numberOfLines={1}>
                {item.displayName}
              </AppText>
              <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
                {[item.city, item.relation ? t(`relation.${item.relation}` as 'relation.friend', { defaultValue: item.relation }) : null]
                  .filter(Boolean)
                  .join(' · ') || ' '}
              </AppText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="caption" weight="bold" color={colors.given} tabular>
                ↗ {item.given ? formatINR(item.given) : '—'}
              </AppText>
              <AppText variant="caption" weight="bold" color={colors.received} tabular>
                ↙ {item.received ? formatINR(item.received) : '—'}
              </AppText>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: radius.button, backgroundColor: colors.ground, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 17, color: colors.ink, paddingVertical: 0 },
  list: { padding: space.xl, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 14,
    paddingVertical: space.md,
    minHeight: 64,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.line,
  },
  first: { borderTopWidth: 1, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
  sep: { height: 1, backgroundColor: colors.line, marginHorizontal: 1 },
});
