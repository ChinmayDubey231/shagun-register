import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { EVENT_TYPES, SUB_FUNCTIONS, type EventRole, type EventType } from '@shagun/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip, Segmented } from '@/components/Choice';
import { Field } from '@/components/Field';
import { ScreenHeader } from '@/components/layout';
import { Avatar } from '@/components/ledger';
import { getDb } from '@/db/client';
import { createEvent, LedgerError, searchPeople, type PersonMatch } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { errorMessage } from '@/i18n';
import { dateToISO, formatDate, isoToLocalDate, todayISO } from '@/lib/format';
import { useLedgerContext } from '@/store/session';
import { colors, radius, space } from '@/theme';

export default function CreateEventScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ctx = useLedgerContext();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('wedding');
  const [role, setRole] = useState<EventRole>('hosted');
  const [hostName, setHostName] = useState('');
  const [host, setHost] = useState<PersonMatch | null>(null);
  const [date, setDate] = useState(todayISO());
  const [showDate, setShowDate] = useState(false);
  const [venue, setVenue] = useState('');
  const [subFunctions, setSubFunctions] = useState<string[]>([]);
  const [customFn, setCustomFn] = useState('');
  const [addingFn, setAddingFn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hostSuggestions = useDbQuery(
    () => (role === 'attended' && !host && hostName.trim() ? searchPeople(getDb(), ctx.familyId, hostName, 4) : []),
    ['people'],
    [role, host, hostName, ctx.familyId],
  );

  const toggleFn = (fn: string) =>
    setSubFunctions((cur) => (cur.includes(fn) ? cur.filter((f) => f !== fn) : [...cur, fn]));

  const addCustomFn = () => {
    const name = customFn.trim();
    if (name && !subFunctions.includes(name)) setSubFunctions((cur) => [...cur, name]);
    setCustomFn('');
    setAddingFn(false);
  };

  const submit = () => {
    try {
      const event = createEvent(ctx, {
        title,
        type,
        role,
        hostPersonId: role === 'attended' ? (host?.id ?? null) : null,
        hostName: role === 'attended' ? (host?.displayName ?? hostName) : null,
        date,
        subFunctions,
        venue: venue || null,
      });
      router.replace({ pathname: '/events/[id]', params: { id: event.id } });
    } catch (e) {
      const field = e instanceof LedgerError ? e.field : undefined;
      setErrors({ [field || 'form']: errorMessage(field) });
    }
  };

  const presetFns = type === 'wedding' ? [...SUB_FUNCTIONS] : [];
  const customFns = subFunctions.filter((f) => !presetFns.includes(f as (typeof SUB_FUNCTIONS)[number]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('createEvent.title')}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel={t('createEvent.scanCard')} onPress={() => router.push('/scan-invite')} style={styles.scanPill}>
            <Feather name="camera" size={18} color={colors.sindoor} />
            <AppText variant="label" weight="bold" color={colors.sindoor}>
              {t('createEvent.scanCard')}
            </AppText>
          </Pressable>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Field
            label={t('createEvent.nameLabel')}
            placeholder={t('createEvent.namePlaceholder')}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setErrors({});
            }}
            error={errors.title}
            autoCapitalize="words"
          />

          <View style={styles.group}>
            <AppText variant="label" color={colors.inkMuted}>
              {t('createEvent.type')}
            </AppText>
            <View style={styles.wrap}>
              {EVENT_TYPES.map((ty) => (
                <Chip key={ty} label={t(`eventType.${ty}`)} selected={type === ty} onPress={() => setType(ty)} />
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <AppText variant="label" color={colors.inkMuted}>
              {t('createEvent.whose')}
            </AppText>
            <Segmented<EventRole>
              label={t('createEvent.whose')}
              value={role}
              onChange={(r) => {
                setRole(r);
                setErrors({});
              }}
              options={[
                { value: 'hosted', label: t('createEvent.ours'), sublabel: t('createEvent.oursHint') },
                { value: 'attended', label: t('createEvent.theirs'), sublabel: t('createEvent.theirsHint') },
              ]}
            />
          </View>

          {role === 'attended' ? (
            <View style={styles.group}>
              {host ? (
                <View style={styles.group}>
                  <AppText variant="label" color={colors.inkMuted}>
                    {t('createEvent.host')}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('createEvent.host')}: ${host.displayName}. ${t('quickEntry.clearPerson')}`}
                    onPress={() => setHost(null)}
                    style={styles.pickedPerson}
                  >
                    <Avatar name={host.displayName} size={36} />
                    <AppText variant="bodyStrong" weight="bold" style={{ flex: 1 }}>
                      {host.displayName}
                    </AppText>
                    <Feather name="x" size={20} color={colors.inkMuted} />
                  </Pressable>
                </View>
              ) : (
                <Field
                  label={t('createEvent.host')}
                  placeholder={t('createEvent.hostPlaceholder')}
                  value={hostName}
                  onChangeText={(v) => {
                    setHostName(v);
                    setErrors({});
                  }}
                  error={errors.hostName}
                  autoCapitalize="words"
                />
              )}
              {hostSuggestions.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={[p.displayName, p.city].filter(Boolean).join(', ')}
                  onPress={() => setHost(p)}
                  style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.ground }]}
                >
                  <Avatar name={p.displayName} size={32} />
                  <AppText variant="bodyStrong" style={{ flex: 1 }}>
                    {p.displayName}
                  </AppText>
                  {p.city ? (
                    <AppText variant="caption" color={colors.inkMuted}>
                      {p.city}
                    </AppText>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.row2}>
            <View style={[styles.group, { flex: 1 }]}>
              <AppText variant="label" color={colors.inkMuted}>
                {t('createEvent.date')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('createEvent.date')}: ${formatDate(date)}`}
                onPress={() => setShowDate(true)}
                style={styles.dateButton}
              >
                <Feather name="calendar" size={20} color={colors.inkMuted} />
                <AppText variant="body" style={{ fontSize: 17 }}>
                  {formatDate(date)}
                </AppText>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label={t('createEvent.venue')}
                optionalLabel={t('common.optional')}
                placeholder={t('createEvent.venuePlaceholder')}
                value={venue}
                onChangeText={setVenue}
              />
            </View>
          </View>
          {showDate ? (
            <DateTimePicker
              value={isoToLocalDate(date)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(event, picked) => {
                setShowDate(Platform.OS === 'ios');
                if (event.type === 'set' && picked) setDate(dateToISO(picked));
              }}
            />
          ) : null}

          <View style={styles.group}>
            <AppText variant="label" color={colors.inkMuted}>
              {t('createEvent.functions')}
              <AppText variant="meta" color={colors.inkMuted}>{` · ${t('createEvent.functionsHint')}`}</AppText>
            </AppText>
            <View style={styles.wrap}>
              {presetFns.map((fn) => (
                <Chip
                  key={fn}
                  tone="marigold"
                  showCheck
                  label={t(`subFunction.${fn}`)}
                  selected={subFunctions.includes(fn)}
                  onPress={() => toggleFn(fn)}
                />
              ))}
              {customFns.map((fn) => (
                <Chip key={fn} tone="marigold" showCheck label={fn} selected onPress={() => toggleFn(fn)} />
              ))}
              {!addingFn ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t('createEvent.addFunction')} onPress={() => setAddingFn(true)} style={styles.addChip}>
                  <Feather name="plus" size={16} color={colors.inkMuted} />
                  <AppText variant="bodyStrong" color={colors.inkMuted}>
                    {t('createEvent.addFunction')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
            {addingFn ? (
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t('createEvent.newFunction')}
                    value={customFn}
                    onChangeText={setCustomFn}
                    autoFocus
                    onSubmitEditing={addCustomFn}
                    returnKeyType="done"
                  />
                </View>
                <Button label={t('createEvent.addIt')} variant="secondary" size="medium" onPress={addCustomFn} style={{ alignSelf: 'flex-end', height: 52 }} />
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          {errors.form || errors.date ? (
            <AppText variant="caption" color={colors.danger} align="center">
              {errors.form ?? errors.date}
            </AppText>
          ) : null}
          <Button label={t('createEvent.create')} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: 18 },
  group: { gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row2: { flexDirection: 'row', gap: space.md },
  dateButton: {
    minHeight: 52,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  scanPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.sindoorTint,
  },
  addChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.placeholder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pickedPerson: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: space.md,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  footer: { padding: space.xl, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line, gap: space.sm, backgroundColor: colors.surface },
});
