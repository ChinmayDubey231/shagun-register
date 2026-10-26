import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { getDb } from '@/db/client';
import { createLocalFamily, LedgerError } from '@/db/ledger';
import { errorMessage } from '@/i18n';
import { newId, useSession } from '@/store/session';
import { colors, fonts, space } from '@/theme';

/** First launch: name the family ledger. (Sign-in and joining with a code arrive in week 3.) */
export default function SetupScreen() {
  const { t } = useTranslation();
  const setFamily = useSession((s) => s.setFamily);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    try {
      setFamily(createLocalFamily(getDb(), name, newId));
    } catch (e) {
      setError(errorMessage(e instanceof LedgerError ? e.field : undefined));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.toran} importantForAccessibility="no">
            {Array.from({ length: 14 }).map((_, i) => (
              <View key={i} style={[styles.toranBead, { backgroundColor: i % 2 ? colors.marigold : '#2E6A3E' }]} />
            ))}
          </View>
          <View style={styles.mark} importantForAccessibility="no">
            <AppText style={{ fontFamily: fonts.wordmark, fontSize: 40, lineHeight: 56 }} color={colors.surface}>
              श
            </AppText>
          </View>
          <View>
            <AppText variant="title" style={{ fontSize: 32, lineHeight: 40 }} accessibilityRole="header">
              Shagun Register
            </AppText>
            <AppText style={{ fontFamily: fonts.wordmark, fontSize: 22, lineHeight: 32 }} color={colors.sindoor}>
              शगुन रजिस्टर
            </AppText>
          </View>
          <AppText variant="section" weight="bold" style={{ marginTop: space.lg }}>
            {t('setup.title')}
          </AppText>
          <AppText color={colors.inkMuted}>{t('setup.body')}</AppText>
          <View style={{ marginTop: space.md }}>
            <Field
              label={t('setup.nameLabel')}
              placeholder={t('setup.namePlaceholder')}
              hint={t('setup.nameHint')}
              error={error}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(null);
              }}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={create}
            />
          </View>
          <View style={{ flex: 1 }} />
          <Button label={t('setup.create')} onPress={create} />
          <AppText variant="caption" color={colors.inkSubtle} align="center">
            {t('setup.localNote')}
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: space.xxl, paddingTop: space.xxxl, gap: space.md },
  toran: { position: 'absolute', top: 0, left: 0, right: 0, height: 18, flexDirection: 'row', justifyContent: 'space-around' },
  toranBead: { width: 14, height: 14, borderRadius: 7, marginTop: 2 },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.sindoor,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
});
