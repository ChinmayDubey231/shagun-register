import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreateOrJoin } from '@/components/CreateOrJoin';
import { ScreenHeader } from '@/components/layout';
import { colors, space } from '@/theme';

/** Start or join a second ledger (e.g. your in-laws' family). */
export default function AddLedgerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top', 'bottom']}>
      <ScreenHeader title={t('setup.addTitle')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: space.xl }} keyboardShouldPersistTaps="handled">
          <CreateOrJoin onDone={() => router.dismissTo('/')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
