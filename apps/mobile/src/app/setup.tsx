import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { CreateOrJoin } from '@/components/CreateOrJoin';
import { Divider, ListGroup, ListRow } from '@/components/layout';
import { signOut } from '@/lib/account';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

/** Signed in but no ledger on this phone yet: start one or join one. */
export default function SetupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const firstName = useSession((s) => s.user?.name.split(' ')[0] ?? '');

  const confirmSignOut = () =>
    Alert.alert(t('more.signOut'), t('more.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText variant="bodyStrong" weight="medium" color={colors.inkMuted}>
            {t('setup.greeting', { name: firstName })}
          </AppText>
          <AppText variant="title" style={{ fontSize: 28 }} accessibilityRole="header">
            {t('setup.title')}
          </AppText>
          <AppText color={colors.inkMuted} style={{ marginBottom: space.sm }}>
            {t('setup.body')}
          </AppText>
          <CreateOrJoin />
          {/* Deleting the last ledger lands here, and More isn't reachable without a ledger. */}
          <View style={{ marginTop: space.lg }}>
            <ListGroup>
              <ListRow icon="log-out" label={t('more.signOut')} onPress={confirmSignOut} />
              <Divider />
              <ListRow icon="trash-2" label={t('more.deleteAccount')} onPress={() => router.push('/account/delete')} danger />
            </ListGroup>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  content: { padding: space.xl, paddingTop: space.xxxl, paddingBottom: space.xxxl, gap: 6 },
});
