import { Feather } from '@expo/vector-icons';
import { createPersonSearch } from '@shagun/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState, ScreenHeader } from '@/components/layout';
import { PersonTotals } from '@/components/ledger';
import { getDb } from '@/db/client';
import {
  countHostedEvents,
  getDuplicateSuggestions,
  getPeopleSummaries,
  LedgerError,
  mergePeople,
  type PersonSummary,
} from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { errorMessage } from '@/i18n';
import { useLedgerContext } from '@/store/session';
import { colors, fonts, radius, space } from '@/theme';

/**
 * Merge two entries for the same person or household. Opened from a duplicate suggestion
 * (both people given) or from a person's page (pick the other one here).
 */
export default function MergeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ a: string; b?: string }>();
  const ctx = useLedgerContext();
  const [otherId, setOtherId] = useState<string | null>(params.b ?? null);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const people = useDbQuery(() => getPeopleSummaries(getDb(), ctx.familyId), ['people', 'entries'], [ctx.familyId]);
  const first = people.find((p) => p.id === params.a);
  const other = otherId ? people.find((p) => p.id === otherId) : undefined;
  // Keep the one with more history unless the family picks the other.
  const keep = first && other ? ([first, other].find((p) => p.id === keepId) ?? (other.exchanges > first.exchanges ? other : first)) : undefined;
  const dup = keep ? (keep.id === first?.id ? other : first) : undefined;
  const hosted = useDbQuery(() => (dup ? countHostedEvents(getDb(), ctx.familyId, dup.id) : 0), ['events'], [ctx.familyId, dup?.id]);

  if (!first) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader close />
        <EmptyState icon="user-x" title={t('person.notFound')} />
      </SafeAreaView>
    );
  }

  if (!other || !keep || !dup) {
    return <PickOther first={first} people={people} onPick={setOtherId} />;
  }

  // "2 gifts and 1 function they hosted will move…", leaving out whichever is zero.
  const summary = (gifts: number, functions: number, name: string, other: string) => {
    const parts = [gifts ? t('merge.gifts', { count: gifts }) : null, functions ? t('merge.functions', { count: functions }) : null].filter(
      (x): x is string => !!x,
    );
    if (!parts.length) return t('merge.summaryEmpty', { other });
    const what = parts.length === 2 ? t('merge.both', { gifts: parts[0], functions: parts[1] }) : parts[0]!;
    return t('merge.summary', { what: what[0]!.toUpperCase() + what.slice(1), name, other });
  };

  const merge = () => {
    try {
      mergePeople(ctx, keep.id, dup.id);
      router.back();
    } catch (e) {
      setError(errorMessage(e instanceof LedgerError ? e.field : undefined));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader close title={t('merge.title')} />
      <ScrollView style={{ backgroundColor: colors.ground }} contentContainerStyle={styles.body}>
        <View style={{ gap: 2 }}>
          <AppText variant="section" accessibilityRole="header">
            {t('merge.keepTitle')}
          </AppText>
          <AppText variant="meta" color={colors.inkMuted}>
            {t('merge.keepHint')}
          </AppText>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('merge.keepTitle')} style={{ gap: space.sm }}>
          {[first, other].map((p) => {
            const on = p.id === keep.id;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${t('merge.keepThis')}: ${p.displayName}`}
                onPress={() => setKeepId(p.id)}
                style={[styles.choice, on && styles.choiceOn]}
              >
                <View style={{ flex: 1 }}>
                  <PersonTotals person={p} />
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <Feather name="check" size={14} color={colors.surface} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.summary}>
          <Feather name="git-merge" size={20} color={colors.sindoor} />
          <AppText variant="meta" style={{ flex: 1 }}>
            {summary(dup.exchanges, hosted, keep.displayName, dup.displayName)}
          </AppText>
        </View>
        {!params.b ? (
          <Button label={t('merge.pickAnother')} variant="quiet" size="medium" icon="search" onPress={() => setOtherId(null)} />
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        {error ? (
          <AppText variant="caption" color={colors.danger} align="center">
            {error}
          </AppText>
        ) : null}
        <Button label={t('merge.button', { name: keep.displayName })} icon="git-merge" onPress={merge} />
      </View>
    </SafeAreaView>
  );
}

/** Step one when opened from a person's page: find the other entry for the same household. */
function PickOther({ first, people, onPick }: { first: PersonSummary; people: PersonSummary[]; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const others = useMemo(() => people.filter((p) => p.id !== first.id), [people, first.id]);
  const search = useMemo(() => createPersonSearch(others), [others]);
  const likely = useDbQuery(
    () =>
      getDuplicateSuggestions(getDb(), first.familyId)
        .filter((s) => s.a.id === first.id || s.b.id === first.id)
        .map((s) => (s.a.id === first.id ? s.b : s.a)),
    ['people', 'app_settings'],
    [first.familyId, first.id],
  );
  const shown = query.trim() ? search(query, 20) : likely;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScreenHeader close title={t('merge.pickTitle', { name: first.displayName })} />
      <View style={styles.pickHead}>
        <AppText variant="meta" color={colors.inkMuted}>
          {t('merge.pickHint')}
        </AppText>
        <View style={styles.search}>
          <Feather name="search" size={20} color={colors.inkMuted} />
          <TextInput
            accessibilityLabel={t('merge.search')}
            placeholder={t('merge.search')}
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={setQuery}
            autoFocus={likely.length === 0}
            style={styles.searchInput}
          />
        </View>
        {!query.trim() && likely.length > 0 ? (
          <AppText variant="eyebrow" color={colors.marigoldInk}>
            {t('merge.likely')}
          </AppText>
        ) : null}
      </View>
      <FlatList
        style={{ backgroundColor: colors.ground }}
        contentContainerStyle={styles.list}
        data={shown}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={query.trim() ? <EmptyState icon="search" title={t('merge.noResults', { query })} /> : undefined}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('merge.pickA11y', { name: item.displayName })}
            onPress={() => onPick(item.id)}
            style={({ pressed }) => [styles.pickRow, pressed && { backgroundColor: colors.ground }]}
          >
            <View style={{ flex: 1 }}>
              <PersonTotals person={item} />
            </View>
            <Feather name="chevron-right" size={18} color={colors.inkMuted} style={{ marginRight: space.md }} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl, gap: space.lg },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingRight: space.md,
  },
  choiceOn: { borderColor: colors.sindoor, borderWidth: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.sindoor, borderColor: colors.sindoor },
  summary: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    backgroundColor: colors.sindoorTint,
    borderRadius: radius.card,
    padding: space.lg,
  },
  footer: { padding: space.xl, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line, gap: space.sm, backgroundColor: colors.surface },
  pickHead: { paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: radius.button, backgroundColor: colors.ground, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 17, color: colors.ink, paddingVertical: 0 },
  list: { padding: space.xl, flexGrow: 1 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
