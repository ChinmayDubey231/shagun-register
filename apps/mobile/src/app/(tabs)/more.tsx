import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Card, Divider, ListGroup, TabHeading } from '@/components/layout';
import { Avatar, SyncPill } from '@/components/ledger';
import { getDb } from '@/db/client';
import { countPendingChanges } from '@/db/ledger';
import { exportErrorMessage, shareLedgerWorkbook } from '@/lib/exports';
import { syncNow, useSyncStatus } from '@/lib/sync';
import { useSyncRefresh } from '@/lib/useSyncRefresh';
import { countRejected } from '@/sync/engine';
import { useDbQuery } from '@/db/useDbQuery';
import { signOut } from '@/lib/account';
import { useSession } from '@/store/session';
import { colors, radius, space } from '@/theme';

function Row({ icon, label, detail, onPress, danger }: {
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.ground }]}
    >
      <Feather name={icon} size={22} color={danger ? colors.danger : colors.inkMuted} />
      <AppText variant="bodyStrong" color={danger ? colors.danger : colors.ink} style={{ flex: 1 }}>
        {label}
      </AppText>
      {detail ? (
        <AppText variant="meta" color={colors.inkMuted}>
          {detail}
        </AppText>
      ) : null}
      {danger ? null : <Feather name="chevron-right" size={18} color={colors.inkMuted} />}
    </Pressable>
  );
}

function ago(at: number, t: ReturnType<typeof useTranslation>['t']) {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  return minutes < 1 ? t('sync.justNow') : t('sync.minutesAgo', { count: minutes });
}

/** Ledger, members, export, account. Hindi and app lock arrive in later weeks. */
export default function MoreScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const family = useSession((s) => s.family);
  const families = useSession((s) => s.families);
  const user = useSession((s) => s.user);
  const pending = useDbQuery(() => countPendingChanges(getDb()), ['outbox'], []);
  const rejected = useDbQuery(() => countRejected(getDb()), ['outbox'], []);
  const sync = useSyncStatus();
  const refreshControl = useSyncRefresh();
  const [exporting, setExporting] = useState(false);
  const roleLabel = { owner: t('family.roleOwner'), editor: t('family.roleEditor'), viewer: t('family.roleViewer') };

  const exportExcel = async () => {
    if (!family || exporting) return;
    setExporting(true);
    try {
      await shareLedgerWorkbook(family.id, family.name, t);
    } catch (e) {
      Alert.alert(exportErrorMessage(e, t));
    } finally {
      setExporting(false);
    }
  };

  const confirmSignOut = () =>
    Alert.alert(t('more.signOut'), t('more.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <TabHeading title={t('more.title')} />
      </View>
      <ScrollView style={{ backgroundColor: colors.ground }} contentContainerStyle={styles.body} refreshControl={refreshControl}>
        <Card style={{ gap: space.md }}>
          <AppText variant="label" color={colors.inkMuted}>
            {t('more.ledger')}
          </AppText>
          <View style={styles.ledgerRow}>
            <View style={styles.icon}>
              <Feather name="book" size={22} color={colors.sindoor} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="rowTitle">{family?.name}</AppText>
              <AppText variant="caption" color={colors.inkMuted}>
                {family ? roleLabel[family.role] : ''}
                {family && !family.registered ? ` · ${t('switcher.pending')}` : ''}
              </AppText>
            </View>
            <SyncPill pendingCount={pending} />
          </View>
          {pending > 0 ? (
            <AppText variant="meta" color={colors.inkMuted}>
              {t('sync.pendingLong', { count: pending })}
            </AppText>
          ) : null}
          {sync.state === 'offline' && pending > 0 ? (
            <AppText variant="meta" color={colors.inkMuted}>
              {t('sync.offline')}
            </AppText>
          ) : null}
          {sync.state === 'error' && sync.lastError ? (
            <AppText variant="meta" color={colors.danger}>
              {t('sync.error', { message: sync.lastError })}
            </AppText>
          ) : null}
          {rejected > 0 ? (
            <View style={{ gap: 2 }}>
              <AppText variant="meta" weight="bold" color={colors.danger}>
                {t('sync.rejected', { count: rejected })}
              </AppText>
              <AppText variant="caption" color={colors.inkMuted}>
                {t('sync.rejectedHint')}
              </AppText>
            </View>
          ) : null}
          <View style={styles.syncRow}>
            <AppText variant="caption" color={colors.inkMuted} style={{ flex: 1 }}>
              {sync.lastSyncAt ? t('sync.lastSynced', { when: ago(sync.lastSyncAt, t) }) : t('sync.never')}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sync.now')}
              disabled={sync.state === 'syncing'}
              onPress={() => void syncNow()}
              style={({ pressed }) => [styles.syncNow, pressed && { opacity: 0.6 }]}
            >
              <Feather name="refresh-cw" size={14} color={colors.sindoor} />
              <AppText variant="meta" weight="bold" color={colors.sindoor}>
                {sync.state === 'syncing' ? t('sync.syncing') : t('sync.now')}
              </AppText>
            </Pressable>
          </View>
        </Card>

        <ListGroup>
          <Row icon="users" label={t('more.members')} onPress={() => router.push('/family')} />
          <Divider />
          <Row icon="repeat" label={t('more.switch')} detail={String(families.length)} onPress={() => router.push('/family/switch')} />
        </ListGroup>

        <View style={{ gap: space.sm }}>
          <ListGroup>
            <Row
              icon={exporting ? 'loader' : 'download'}
              label={t('export.excel')}
              detail={exporting ? t('export.working') : undefined}
              onPress={() => void exportExcel()}
            />
          </ListGroup>
          <AppText variant="caption" color={colors.inkMuted} style={{ paddingHorizontal: space.sm }}>
            {t('export.excelHint')}
          </AppText>
        </View>

        <Card style={{ gap: space.md }}>
          <AppText variant="label" color={colors.inkMuted}>
            {t('more.account')}
          </AppText>
          <View style={styles.ledgerRow}>
            <Avatar name={user?.name ?? '?'} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" weight="bold">
                {user?.name}
              </AppText>
              <AppText variant="caption" color={colors.inkMuted}>
                {user?.email}
              </AppText>
            </View>
          </View>
        </Card>
        <ListGroup>
          <Row icon="log-out" label={t('more.signOut')} onPress={confirmSignOut} danger />
        </ListGroup>

        <Card style={{ gap: space.sm }}>
          <AppText variant="label" color={colors.inkMuted}>
            {t('more.comingNext')}
          </AppText>
          <AppText variant="meta">{t('more.comingNextBody')}</AppText>
        </Card>

        <AppText variant="caption" color={colors.inkSubtle} align="center">
          {t('more.version', { version: Constants.expoConfig?.version ?? '0.1.0' })}
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: space.md },
  syncNow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.sindoorTint },
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  body: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.sindoorTint, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.lg },
});
