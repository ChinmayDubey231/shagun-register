import { Feather } from '@expo/vector-icons';
import { INVITE_CODE_LENGTH, normalizeInviteCode } from '@shagun/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Card } from '@/components/layout';
import { LedgerError } from '@/db/ledger';
import { apiErrorMessage, errorMessage } from '@/i18n';
import { createLedger, joinLedger } from '@/lib/account';
import { colors, fonts, radius, space } from '@/theme';

/**
 * The two ways into a ledger (design board 02): start one (works offline; registered with
 * the server when online) or join with an owner's 6-character code (needs the internet).
 */
export function CreateOrJoin({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const create = () => {
    try {
      createLedger(name);
      onDone?.();
    } catch (e) {
      setNameError(errorMessage(e instanceof LedgerError ? e.field : undefined));
    }
  };

  const join = async () => {
    if (code.length !== INVITE_CODE_LENGTH) {
      setJoinError(t('errors.code'));
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      await joinLedger(code);
      onDone?.();
    } catch (e) {
      setJoinError(apiErrorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={{ gap: space.lg }}>
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.icon, { backgroundColor: colors.sindoorTint }]}>
            <Feather name="book" size={22} color={colors.sindoor} />
          </View>
          <AppText variant="section" accessibilityRole="header">
            {t('setup.createTitle')}
          </AppText>
        </View>
        <Field
          label={t('setup.nameLabel')}
          placeholder={t('setup.namePlaceholder')}
          hint={t('setup.nameHint')}
          error={nameError}
          value={name}
          onChangeText={(v) => {
            setName(v);
            setNameError(null);
          }}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={create}
        />
        <Button label={t('setup.create')} onPress={create} size="medium" />
      </Card>

      <View style={styles.or} importantForAccessibility="no">
        <View style={styles.rule} />
        <AppText variant="label" color={colors.inkMuted}>
          {t('setup.or')}
        </AppText>
        <View style={styles.rule} />
      </View>

      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.icon, { backgroundColor: colors.receivedTint }]}>
            <Feather name="key" size={22} color={colors.received} />
          </View>
          <AppText variant="section" accessibilityRole="header">
            {t('setup.joinTitle')}
          </AppText>
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label" color={colors.inkMuted}>
            {t('setup.codeLabel')}
          </AppText>
          <TextInput
            accessibilityLabel={t('setup.codeLabel')}
            value={code}
            onChangeText={(v) => {
              setCode(normalizeInviteCode(v).slice(0, INVITE_CODE_LENGTH));
              setJoinError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            placeholder="K7M2QX"
            placeholderTextColor={colors.lineStrong}
            style={[styles.codeInput, joinError ? { borderColor: colors.danger } : null]}
          />
          {joinError ? (
            <AppText variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
              {joinError}
            </AppText>
          ) : (
            <AppText variant="caption" color={colors.inkSubtle}>
              {t('setup.codeHint')}
            </AppText>
          )}
        </View>
        <Button
          label={t('setup.join')}
          variant={code.length === INVITE_CODE_LENGTH ? 'primary' : 'quiet'}
          size="medium"
          busy={joining}
          onPress={join}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: space.xl },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  or: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: 1, backgroundColor: colors.lineStrong },
  codeInput: {
    height: 56,
    borderRadius: radius.input,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    paddingHorizontal: space.lg,
    // Android's default padding pushes the code up off centre in a fixed-height box.
    paddingVertical: 0,
    fontFamily: fonts.extrabold,
    fontSize: 26,
    letterSpacing: 8,
    color: colors.ink,
    textAlign: 'center',
  },
});
