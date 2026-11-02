import { Feather } from '@expo/vector-icons';
import { amountFromDigits, formatINR, groupINR } from '@shagun/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card, EmptyState, ScreenHeader } from '@/components/layout';
import { getDb } from '@/db/client';
import { addCashCount, getCashCounts, getCashEntries, getCashSummary, getEventSummary, LedgerError } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { errorMessage } from '@/i18n';
import { formatShortDateTime, formatTime } from '@/lib/format';
import { useLedgerContext } from '@/store/session';
import { colors, fonts, radius, space } from '@/theme';

/**
 * End of the function: count the envelopes, compare with the cash logged in the app,
 * and tick entries off to find the gap. Every count is saved; none is overwritten.
 */
export default function CashReconciliationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = useLedgerContext();
  const event = useDbQuery(() => getEventSummary(getDb(), ctx.familyId, id), ['events'], [id, ctx.familyId]);
  const summary = useDbQuery(() => getCashSummary(getDb(), id), ['entries'], [id]);
  const cashEntries = useDbQuery(() => getCashEntries(getDb(), id), ['entries', 'people'], [id]);
  const counts = useDbQuery(() => getCashCounts(getDb(), id), ['cash_counts'], [id]);
  const [digits, setDigits] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader />
        <EmptyState icon="alert-circle" title={t('eventDetail.notFound')} />
      </SafeAreaView>
    );
  }

  const counted = amountFromDigits(digits);
  const diff = counted - summary.loggedCash;
  const status = !digits ? null : diff === 0 ? 'match' : diff < 0 ? 'short' : 'over';
  const tone = {
    match: { bg: colors.successTint, fg: colors.success, icon: 'check-circle' as const },
    short: { bg: colors.dangerTint, fg: '#8F1C13', icon: 'alert-triangle' as const },
    over: { bg: colors.marigoldTint, fg: colors.marigoldInk, icon: 'info' as const },
  };
  const checkedTotal = cashEntries.filter((e) => checked.has(e.id)).reduce((s, e) => s + e.amount, 0);

  const toggle = (entryId: string) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });

  const save = () => {
    try {
      addCashCount(ctx, { eventId: id, countedAmount: counted });
      router.back();
    } catch (e) {
      setError(errorMessage(e instanceof LedgerError ? e.field : undefined));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader title={t('cash.title')} subtitle={event.title} />
      <FlatList
        style={{ backgroundColor: colors.ground }}
        contentContainerStyle={styles.list}
        data={cashEntries}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: space.sm }}>
            <Card style={{ gap: 14 }}>
              <View style={styles.rowBetween}>
                <AppText variant="label" color={colors.inkMuted}>
                  {t('cash.logged', { count: summary.cashEntries })}
                </AppText>
                <AppText variant="section" weight="extrabold" tabular>
                  {formatINR(summary.loggedCash)}
                </AppText>
              </View>
              <View style={{ gap: 6 }}>
                <AppText variant="bodyStrong" weight="bold">
                  {t('cash.counted')}
                </AppText>
                <View style={styles.inputWrap}>
                  <AppText style={styles.rupee} color={colors.inkMuted}>
                    ₹
                  </AppText>
                  <TextInput
                    accessibilityLabel={t('cash.counted')}
                    keyboardType="number-pad"
                    value={digits ? groupINR(counted) : ''}
                    placeholder="0"
                    placeholderTextColor={colors.placeholder}
                    onChangeText={(v) => {
                      setDigits(v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 7));
                      setError(null);
                    }}
                    style={styles.input}
                  />
                </View>
              </View>
              {status ? (
                <View accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: tone[status].bg }]}>
                  <Feather name={tone[status].icon} size={24} color={tone[status].fg} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="section" weight="extrabold" color={tone[status].fg}>
                      {status === 'match'
                        ? t('cash.match')
                        : status === 'short'
                          ? t('cash.short', { amount: formatINR(-diff) })
                          : t('cash.over', { amount: formatINR(diff) })}
                    </AppText>
                    <AppText variant="meta" color={tone[status].fg}>
                      {status === 'match' ? t('cash.matchHint') : status === 'short' ? t('cash.shortHint') : t('cash.overHint')}
                    </AppText>
                  </View>
                </View>
              ) : null}
            </Card>
            {cashEntries.length > 0 ? (
              <View style={styles.rowBetween}>
                <AppText variant="rowTitle">{t('cash.entries')}</AppText>
                <AppText variant="caption" color={colors.inkMuted} tabular>
                  {t('cash.ticked', { count: checked.size, amount: formatINR(checkedTotal) })}
                </AppText>
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.line }} />}
        renderItem={({ item, index }) => {
          const on = checked.has(item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${item.personName}, ${formatINR(item.amount)}`}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [
                styles.entry,
                index === 0 && styles.first,
                index === cashEntries.length - 1 && styles.last,
                pressed && { backgroundColor: colors.ground },
              ]}
            >
              <View style={[styles.box, on && styles.boxOn]}>{on ? <Feather name="check" size={16} color={colors.surface} /> : null}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="bodyStrong" weight="bold" numberOfLines={1} style={on ? { color: colors.inkMuted } : null}>
                  {item.personName}
                </AppText>
                <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
                  {[
                    item.relation ? t(`relation.${item.relation}` as 'relation.friend', { defaultValue: item.relation }) : null,
                    item.subFunction ? t(`subFunction.${item.subFunction}` as 'subFunction.haldi', { defaultValue: item.subFunction }) : null,
                    formatTime(item.createdAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
              </View>
              <AppText variant="bodyStrong" weight="extrabold" tabular>
                {formatINR(item.amount)}
              </AppText>
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState icon="layers" title={t('cash.empty')} />}
        ListFooterComponent={
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            {cashEntries.length > 0 ? (
              <AppText variant="caption" color={colors.inkMuted}>
                {t('cash.tickHint')}
              </AppText>
            ) : null}
            {counts.length > 0 ? (
              <Card style={{ gap: 6 }}>
                <AppText variant="label" color={colors.inkMuted}>
                  {t('cash.earlier')}
                </AppText>
                {counts.map((c) => (
                  <View key={c.id} style={styles.rowBetween}>
                    <AppText variant="meta">{formatShortDateTime(c.countedAt)}</AppText>
                    <AppText variant="meta" weight="bold" tabular>
                      {formatINR(c.countedAmount)}
                    </AppText>
                  </View>
                ))}
              </Card>
            ) : null}
          </View>
        }
      />
      <View style={styles.footer}>
        {error ? (
          <AppText variant="caption" color={colors.danger} align="center">
            {error}
          </AppText>
        ) : null}
        <Button label={t('cash.save')} onPress={save} disabled={!digits} />
        <AppText variant="tiny" weight="regular" color={colors.inkMuted} align="center">
          {t('cash.keptNote')}
        </AppText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.xl, flexGrow: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 60,
    borderRadius: radius.button,
    borderWidth: 2,
    borderColor: colors.sindoor,
    paddingHorizontal: 14,
  },
  rupee: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 34 },
  input: { flex: 1, fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink, paddingVertical: 0, fontVariant: ['tabular-nums'] },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 14, borderRadius: radius.button },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 60,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.line,
  },
  first: { borderTopWidth: 1, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.sindoor, borderColor: colors.sindoor },
  footer: { padding: space.xl, paddingTop: space.md, gap: 6, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
});
