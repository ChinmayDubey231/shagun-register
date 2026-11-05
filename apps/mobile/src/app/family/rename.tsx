import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ScreenHeader } from '@/components/layout';
import { apiErrorMessage, errorMessage } from '@/i18n';
import { renameLedger } from '@/lib/account';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

/** Owner only. Needs the internet, because the name lives on the server for every member. */
export default function RenameLedgerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const family = useSession((s) => s.family);
  const [name, setName] = useState(family?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!family) return null;

  const save = async () => {
    const next = name.trim();
    if (!next) {
      setError(errorMessage('name'));
      return;
    }
    if (next === family.name) {
      router.back();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await renameLedger(family.id, next);
      router.back();
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top', 'bottom']}>
      <ScreenHeader title={t('family.rename')} close />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <Field
            label={t('setup.nameLabel')}
            hint={t('family.renameHint')}
            error={error}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            autoCapitalize="words"
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
          />
          <Button label={t('family.renameSave')} size="medium" busy={busy} onPress={() => void save()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
