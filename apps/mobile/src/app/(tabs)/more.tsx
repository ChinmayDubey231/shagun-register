import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Card, Divider, ListGroup } from '@/components/layout';
import { Avatar, SyncPill } from '@/components/ledger';
import { getDb } from '@/db/client';
import { countPendingChanges } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { signOut } from '@/lib/account';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

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

/** Ledger, members, account. Export, language and app lock arrive in later weeks. */
export default function MoreScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const family = useSession((s) => s.family);
  const families = useSession((s) => s.families);
  const user = useSession((s) => s.user);
  const pending = useDbQuery(() => countPendingChanges(getDb()), ['outbox'], []);
  const roleLabel = { owner: t('family.roleOwner'), editor: t('family.roleEditor'), viewer: t('family.roleViewer') };

  const confirmSignOut = () =>
    Alert.alert(t('more.signOut'), t('more.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('more.title')}
        </AppText>
      </View>
      <ScrollView style={{ backgroundColor: colors.ground }} contentContainerStyle={styles.body}>
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
        </Card>

        <ListGroup>
          <Row icon="users" label={t('more.members')} onPress={() => router.push('/family')} />
          <Divider />
          <Row icon="repeat" label={t('more.switch')} detail={String(families.length)} onPress={() => router.push('/family/switch')} />
        </ListGroup>

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
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  body: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.sindoorTint, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.lg },
});
