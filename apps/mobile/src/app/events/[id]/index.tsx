import { Feather } from '@expo/vector-icons';
import { formatINR } from '@shagun/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState, IconButton, ScreenHeader } from '@/components/layout';
import { EntryRow } from '@/components/ledger';
import { getDb } from '@/db/client';
import { deleteEntry, getEventEntries, getEventModeTotals, getEventSummary } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { exportErrorMessage, shareEventRegister } from '@/lib/exports';
import { formatDate } from '@/lib/format';
import { useCanEdit, useLedgerContext, useSession } from '@/store/session';
import { colors, radius, space } from '@/theme';
import { useSyncRefresh } from '@/lib/useSyncRefresh';

/**
 * Up to three modes share one row. All four (cash, UPI, cheque, item) would leave each box
 * too narrow for a five-digit total on a small phone, so they go two by two instead.
 */
function modeRows<T>(modes: readonly T[]): T[][] {
  const perRow = modes.length > 3 ? 2 : modes.length;
  const rows: T[][] = [];
  for (let i = 0; i < modes.length; i += perRow) rows.push(modes.slice(i, i + perRow));
  return rows;
}

export default function EventDetailScreen() {
  const refreshControl = useSyncRefresh();
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = useLedgerContext();
  const canEdit = useCanEdit();
  const [fn, setFn] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const ledgerName = useSession((s) => s.family?.name ?? '');

  const event = useDbQuery(() => getEventSummary(getDb(), ctx.familyId, id), ['events', 'entries', 'people'], [id, ctx.familyId]);
  const modes = useDbQuery(() => getEventModeTotals(getDb(), id), ['entries'], [id]);
  const list = useDbQuery(() => getEventEntries(getDb(), id, fn), ['entries', 'people', 'outbox'], [id, fn]);

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader />
        <EmptyState icon="alert-circle" title={t('eventDetail.notFound')} />
      </SafeAreaView>
    );
  }

  const hosted = event.role === 'hosted';
  const total = hosted ? event.received : event.given;
  const pendingCount = list.filter((e) => e.pending).length;
  const meta = [
    hosted ? t('eventRole.hosted') : (event.hostName ?? t('eventRole.attended')),
    formatDate(event.date),
    event.venue,
  ]
    .filter(Boolean)
    .join(' · ');

  const entryActions = (entryId: string, name: string, amount: string) =>
    Alert.alert(`${name} · ${amount}`, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => confirmDelete(entryId, name, amount) },
      { text: t('eventDetail.editEntry'), onPress: () => router.push({ pathname: '/events/[id]/entry', params: { id, entryId } }) },
    ]);

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await shareEventRegister(ctx.familyId, ledgerName, id, t);
    } catch (e) {
      Alert.alert(exportErrorMessage(e, t));
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = (entryId: string, name: string, amount: string) =>
    Alert.alert(t('eventDetail.deleteTitle'), t('eventDetail.deleteBody', { name, amount }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteEntry(ctx, entryId) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.sindoor }}>
        <ScreenHeader
          tone="sindoor"
          right={<IconButton icon={exporting ? 'loader' : 'share'} label={t('export.pdf')} color={colors.surface} onPress={() => void exportPdf()} />}
        />
        <View style={styles.hero}>
          <AppText variant="title" color={colors.surface} accessibilityRole="header">
            {event.title}
          </AppText>
          <AppText variant="meta" color={colors.onSindoorMuted}>
            {meta}
          </AppText>
          <View style={styles.totalRow}>
            <View>
              <AppText variant="caption" weight="semibold" color={colors.onSindoorMuted}>
                {hosted ? t('eventDetail.totalReceived') : t('eventDetail.totalGiven')}
              </AppText>
              <AppText variant="amountXL" color={colors.surface} tabular>
                {formatINR(total)}
              </AppText>
            </View>
            <AppText variant="bodyStrong" weight="bold" color={colors.surface} style={{ marginBottom: 6 }}>
              {t('events.entries', { count: event.entryCount })}
            </AppText>
          </View>
          {modes.length > 0 ? (
            <View style={styles.modes}>
              {modeRows(modes).map((row) => (
                <View key={row.map((m) => m.mode).join()} style={styles.modeRow}>
                  {row.map((m) => (
                    <View key={m.mode} style={styles.modeBox}>
                      <AppText variant="tiny" weight="regular" color={colors.onSindoorMuted} numberOfLines={1}>
                        {t('eventDetail.modeCount', { mode: t(`mode.${m.mode}`), count: m.count })}
                      </AppText>
                      {/* One line always: a long amount shrinks a little rather than breaking. */}
                      <AppText variant="bodyStrong" weight="bold" color={colors.surface} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                        {m.mode === 'item' && m.total === 0 ? t('eventDetail.items', { count: m.count }) : formatINR(m.total)}
                      </AppText>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <View style={styles.toolbar}>
        {hosted && canEdit ? (
          <Button
            label={t('eventDetail.countCash')}
            icon="layers"
            variant="quiet"
            size="medium"
            style={{ height: 44 }}
            onPress={() => router.push({ pathname: '/events/[id]/cash', params: { id } })}
          />
        ) : null}
        {event.subFunctions.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={styles.tabs}>
            {[null, ...event.subFunctions].map((f) => {
              const on = fn === f;
              return (
                <Pressable
                  key={f ?? 'all'}
                  accessibilityRole="tab"
                  accessibilityLabel={f ? t(`subFunction.${f}` as 'subFunction.haldi', { defaultValue: f }) : t('eventDetail.all')}
                  accessibilityState={{ selected: on }}
                  onPress={() => setFn(f)}
                  style={[styles.tab, on && styles.tabOn]}
                >
                  <AppText variant="bodyStrong" weight={on ? 'bold' : 'semibold'} color={on ? colors.sindoor : colors.inkMuted}>
                    {f ? t(`subFunction.${f}` as 'subFunction.haldi', { defaultValue: f }) : t('eventDetail.all')}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        refreshControl={refreshControl}
        data={list}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          list.length > 0 ? (
            <View style={styles.syncLine}>
              <View style={[styles.dot, { backgroundColor: pendingCount ? colors.marigold : colors.success }]} />
              <AppText variant="caption" color={colors.inkMuted}>
                {t('sync.line', { synced: list.length - pendingCount, pending: pendingCount })}
              </AppText>
            </View>
          ) : undefined
        }
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.line }} />}
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.rowWrap,
              index === 0 && { borderTopWidth: 1, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
              index === list.length - 1 && { borderBottomWidth: 1, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
            ]}
          >
            <EntryRow
              item={item}
              onPress={() => router.push({ pathname: '/people/[id]', params: { id: item.personId } })}
              onLongPress={!canEdit ? undefined : () => entryActions(item.id, item.personName, item.mode === 'item' && !item.amount ? t('mode.item') : formatINR(item.amount))}
            />
          </View>
        )}
        ListFooterComponent={
          list.length > 0 ? (
            <AppText variant="caption" color={colors.inkSubtle} align="center" style={{ marginTop: space.md }}>
              {t('eventDetail.entryActions')}
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={<EmptyState icon="gift" title={t('eventDetail.emptyTitle')} body={t('eventDetail.emptyBody')} />}
      />

      {canEdit ? (
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hosted ? t('eventDetail.logGift') : t('eventDetail.logGiven')}
          onPress={() => router.push({ pathname: '/events/[id]/entry', params: { id } })}
          style={({ pressed }) => [styles.logButton, { backgroundColor: pressed ? colors.sindoorDark : colors.sindoor }]}
        >
          <Feather name="plus" size={22} color={colors.surface} />
          <AppText variant="rowTitle" color={colors.surface} style={{ fontSize: 18 }}>
            {hosted ? t('eventDetail.logGift') : t('eventDetail.logGiven')}
          </AppText>
        </Pressable>
      </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: 2 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.md },
  modes: { gap: space.sm, marginTop: space.md },
  modeRow: { flexDirection: 'row', gap: space.sm },
  modeBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.input, paddingVertical: space.sm, paddingHorizontal: 10 },
  toolbar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line, paddingTop: space.md, paddingHorizontal: space.xl, gap: space.sm },
  tabs: { gap: 4 },
  // Every tab carries the underline's width, so the selected label doesn't sit higher than the rest.
  tab: { height: 44, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.sindoor },
  list: { padding: space.xl, paddingBottom: 120, flexGrow: 1 },
  syncLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowWrap: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line, overflow: 'hidden', backgroundColor: colors.surface },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md },
  logButton: {
    height: 58,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: space.md,
    elevation: 4,
    shadowColor: colors.sindoor,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
});
