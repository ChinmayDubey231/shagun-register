import { RELATION_PRESETS } from '@shagun/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Choice';
import { Field } from '@/components/Field';
import { EmptyState, ScreenHeader } from '@/components/layout';
import { getDb } from '@/db/client';
import { getPerson, LedgerError, updatePerson } from '@/db/ledger';
import { errorMessage } from '@/i18n';
import { useLedgerContext } from '@/store/session';
import { colors, space } from '@/theme';

/** Fix a name, add the city that tells two Ramesh Sharmas apart, or set the relation. */
export default function EditPersonScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = useLedgerContext();
  const [initial] = useState(() => getPerson(getDb(), ctx.familyId, id));
  const [name, setName] = useState(initial?.displayName ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [relation, setRelation] = useState<string | null>(initial?.relation ?? null);
  const [customRelation, setCustomRelation] = useState(
    initial?.relation && !(RELATION_PRESETS as readonly string[]).includes(initial.relation) ? initial.relation : '',
  );
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  if (!initial) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader close />
        <EmptyState icon="user-x" title={t('person.notFound')} />
      </SafeAreaView>
    );
  }

  const save = () => {
    try {
      updatePerson(ctx, id, {
        displayName: name,
        relation: customRelation.trim() || relation,
        city: city || null,
        phone: phone || null,
      });
      router.back();
    } catch (e) {
      const field = e instanceof LedgerError ? e.field : undefined;
      setError({ field: field ?? 'form', message: field === 'displayName' ? t('errors.displayName') : errorMessage(field) });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader close title={t('person.editTitle')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Field
            label={t('person.nameLabel')}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            error={error?.field === 'displayName' ? error.message : null}
            hint={t('person.nameHint')}
            autoCapitalize="words"
          />
          <Field label={t('person.cityLabel')} optionalLabel={t('common.optional')} value={city} onChangeText={setCity} autoCapitalize="words" />
          <Field
            label={t('person.phoneLabel')}
            optionalLabel={t('common.optional')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <View style={{ gap: space.sm }}>
            <AppText variant="label" color={colors.inkMuted}>
              {t('quickEntry.relation')}
            </AppText>
            <View style={styles.wrap}>
              {RELATION_PRESETS.map((r) => (
                <Chip
                  key={r}
                  label={t(`relation.${r}`)}
                  selected={!customRelation && relation === r}
                  onPress={() => {
                    setCustomRelation('');
                    setRelation(relation === r ? null : r);
                  }}
                />
              ))}
            </View>
            <Field
              label={t('person.otherRelation')}
              placeholder={t('person.otherRelationPlaceholder')}
              value={customRelation}
              onChangeText={setCustomRelation}
            />
          </View>
        </ScrollView>
        <View style={styles.footer}>
          {error && error.field !== 'displayName' ? (
            <AppText variant="caption" color={colors.danger} align="center">
              {error.message}
            </AppText>
          ) : null}
          <Button label={t('person.save')} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl, gap: 18 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { padding: space.xl, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line, gap: space.sm },
});
