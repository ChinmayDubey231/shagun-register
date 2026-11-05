import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ScreenHeader } from '@/components/layout';
import { apiErrorMessage } from '@/i18n';
import { deleteLedger } from '@/lib/account';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

const sameText = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** Owner only. Deleting takes a whole family's record with it, so the name has to be typed out. */
export default function DeleteLedgerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // Kept from the start: once deleted, the session moves on to the next ledger while this screen closes.
  const [ledger] = useState(useSession.getState().family);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ledger) return null;
  const matches = sameText(typed, ledger.name);

  const confirm = async () => {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLedger(ledger.id);
      router.dismissTo('/');
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top', 'bottom']}>
      <ScreenHeader title={t('family.deleteLedger')} close />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <AppText variant="bodyStrong">{t('family.deleteBody', { name: ledger.name })}</AppText>
          <AppText color={colors.inkMuted}>{t('family.deleteExport')}</AppText>
          <Field
            label={t('family.deleteType')}
            placeholder={ledger.name}
            error={error}
            value={typed}
            onChangeText={(v) => {
              setTyped(v);
              setError(null);
            }}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Button label={t('family.deleteConfirm')} variant="danger" size="medium" disabled={!matches} busy={busy} onPress={() => void confirm()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
