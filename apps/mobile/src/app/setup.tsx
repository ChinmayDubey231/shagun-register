import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { CreateOrJoin } from '@/components/CreateOrJoin';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

/** Signed in but no ledger on this phone yet: start one or join one. */
export default function SetupScreen() {
  const { t } = useTranslation();
  const firstName = useSession((s) => s.user?.name.split(' ')[0] ?? '');

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  content: { padding: space.xl, paddingTop: space.xxxl, gap: 6 },
});
