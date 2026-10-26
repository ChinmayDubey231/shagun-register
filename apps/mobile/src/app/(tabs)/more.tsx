import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/layout';
import { SyncPill } from '@/components/ledger';
import { getDb } from '@/db/client';
import { countPendingChanges } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

/** Week 1: ledger info and sync status. Members, export, language and app lock arrive in later weeks. */
export default function MoreScreen() {
  const { t } = useTranslation();
  const family = useSession((s) => s.family);
  const pending = useDbQuery(() => countPendingChanges(getDb()), ['outbox'], []);

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
          <View style={styles.row}>
            <View style={styles.icon}>
              <Feather name="book" size={22} color={colors.sindoor} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="rowTitle">{family?.name}</AppText>
              <AppText variant="caption" color={colors.inkMuted}>
                {t('more.onPhone')}
              </AppText>
            </View>
          </View>
          <View style={styles.row}>
            <SyncPill pendingCount={pending} />
          </View>
          {pending > 0 ? (
            <AppText variant="meta" color={colors.inkMuted}>
              {t('sync.pendingLong', { count: pending })}
            </AppText>
          ) : null}
        </Card>

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
  body: { padding: space.xl, gap: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.sindoorTint, alignItems: 'center', justifyContent: 'center' },
});
