import type { AccountDeletionPreview, FamilySummary } from '@shagun/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Card, Divider, ListGroup, ListRow, ScreenHeader } from '@/components/layout';
import { apiErrorMessage } from '@/i18n';
import { deleteAccount, switchLedger } from '@/lib/account';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

function LedgerNames({ title, body, ledgers }: { title: string; body?: string; ledgers: FamilySummary[] }) {
  if (ledgers.length === 0) return null;
  return (
    <Card style={{ gap: space.xs }}>
      <AppText variant="label" color={colors.inkMuted}>
        {title}
      </AppText>
      {ledgers.map((l) => (
        <AppText key={l.id} variant="bodyStrong">
          {l.name}
        </AppText>
      ))}
      {body ? (
        <AppText variant="caption" color={colors.inkMuted}>
          {body}
        </AppText>
      ) : null}
    </Card>
  );
}

/**
 * Google Play requires this in the app. Ledgers others rely on must be dealt with first, and
 * the screen links straight to them. Typing the email guards against a mistaken tap, and it
 * works on any keyboard, whichever language the app is in.
 */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const email = useSession((s) => s.user?.email ?? '');
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Runs again on return from a ledger, in case it was just handed over or deleted.
  useFocusEffect(
    useCallback(() => {
      let current = true;
      setError(null);
      api<AccountDeletionPreview>('/me/deletion').then(
        (p) => {
          if (current) setPreview(p);
        },
        (e: unknown) => {
          if (current) setError(apiErrorMessage(e));
        },
      );
      return () => {
        current = false;
      };
    }, []),
  );

  const blocked = (preview?.blocks.length ?? 0) > 0;
  const matches = email.length > 0 && typed.trim().toLowerCase() === email.toLowerCase();

  const openLedger = (l: FamilySummary) => {
    switchLedger(l.id);
    router.push('/family');
  };

  const confirm = async () => {
    if (!matches || blocked) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      Alert.alert(t('account.done'));
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader title={t('account.deleteTitle')} close />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={{ backgroundColor: colors.ground }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <AppText variant="bodyStrong">{t('account.deleteIntro')}</AppText>
          <AppText color={colors.inkMuted}>{t('account.otherPhones')}</AppText>
          {preview === null && !error ? <ActivityIndicator color={colors.sindoor} /> : null}
          {preview && blocked ? (
            <View style={{ gap: space.sm }}>
              <AppText variant="rowTitle" accessibilityRole="header">
                {t('account.blocksTitle')}
              </AppText>
              <AppText color={colors.inkMuted}>{t('account.blocksBody')}</AppText>
              <ListGroup>
                {preview.blocks.map((l, i) => (
                  <View key={l.id}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow icon="book" label={l.name} onPress={() => openLedger(l)} />
                  </View>
                ))}
              </ListGroup>
            </View>
          ) : null}
          {preview ? (
            <>
              <LedgerNames title={t('account.deletesTitle')} ledgers={preview.deletes} />
              <LedgerNames title={t('account.leavesTitle')} body={t('account.leavesBody')} ledgers={preview.leaves} />
            </>
          ) : null}
          {preview && !blocked ? (
            <Field
              label={t('account.typeEmail', { email })}
              placeholder={email}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          ) : null}
          {error ? (
            <AppText variant="meta" color={colors.danger} accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
          {preview && !blocked ? (
            <Button label={t('account.confirm')} variant="danger" size="medium" disabled={!matches} busy={busy} onPress={() => void confirm()} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
});
