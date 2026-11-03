import { Feather } from '@expo/vector-icons';
import {
  AMOUNT_CHIPS,
  amountFromDigits,
  formatINR,
  groupINR,
  pressAmountKey,
  createPersonSearch,
  exactKeyMatches,
  RELATION_PRESETS,
  type Direction,
  type PaymentMode,
} from '@shagun/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip, ChipRow, Segmented } from '@/components/Choice';
import { Field } from '@/components/Field';
import { Keypad } from '@/components/Keypad';
import { EmptyState, ScreenHeader } from '@/components/layout';
import { Avatar, withArrows } from '@/components/ledger';
import { getDb } from '@/db/client';
import {
  addEntry,
  getEntry,
  getEventSummary,
  getLastExchange,
  getPeopleIndex,
  getPerson,
  LedgerError,
  updateEntry,
  type PersonMatch,
} from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { errorMessage } from '@/i18n';
import { contactsAlreadyAllowed, loadContacts, type PhoneContact } from '@/lib/contacts';
import { useKeyboardVisible } from '@/lib/useKeyboardVisible';
import { useLedgerContext, useSession } from '@/store/session';
import { colors, directionColors, fonts, radius, space } from '@/theme';

type Who = { kind: 'existing'; person: PersonMatch } | { kind: 'new'; name: string; phone?: string | null } | null;

export default function QuickEntryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id: eventId, entryId } = useLocalSearchParams<{ id: string; entryId?: string }>();
  const ctx = useLedgerContext();
  /** Set when fixing an existing entry instead of logging a new one. */
  const [editing] = useState(() => (entryId ? getEntry(getDb(), ctx.familyId, entryId) : undefined));
  const event = useDbQuery(() => getEventSummary(getDb(), ctx.familyId, eventId), ['events'], [eventId, ctx.familyId]);
  const lastFn = useSession((s) => s.lastSubFunction[eventId]);
  const rememberFn = useSession((s) => s.rememberSubFunction);
  const keyboardOpen = useKeyboardVisible();
  const insets = useSafeAreaInsets();
  const nameRef = useRef<TextInputInstance>(null);

  const [direction, setDirection] = useState<Direction>(
    editing?.direction ?? (event?.role === 'attended' ? 'given' : 'received'),
  );
  const [who, setWho] = useState<Who>(null);
  const [nameText, setNameText] = useState('');
  const [relation, setRelation] = useState<string | null>(null);
  const [subFunction, setSubFunction] = useState<string | null>(
    editing ? editing.subFunction : (lastFn ?? event?.subFunctions[0] ?? null),
  );
  const [digits, setDigits] = useState(editing && editing.amount > 0 ? String(editing.amount) : '');
  const [mode, setMode] = useState<PaymentMode>(editing?.mode ?? 'cash');
  const [itemNote, setItemNote] = useState(editing?.itemNote ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [showNote, setShowNote] = useState(!!editing?.note);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saved, setSaved] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [newCity, setNewCity] = useState('');
  /** null = not asked yet; 'denied' = no permission; otherwise the phone's contacts (memory only). */
  const [contacts, setContacts] = useState<PhoneContact[] | 'denied' | null>(null);

  // Editing: start with the entry's person. Another family's function: start with the host.
  useEffect(() => {
    const startId = editing ? editing.personId : event?.role === 'attended' ? event.hostPersonId : null;
    if (startId) {
      const person = getPerson(getDb(), ctx.familyId, startId);
      if (person) pickPerson({ ...person, lastAmount: null, lastDirection: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // If contacts were allowed earlier, load them quietly; otherwise wait for the user to ask.
  useEffect(() => {
    void contactsAlreadyAllowed().then((ok) => (ok ? loadContacts().then(setContacts) : undefined));
  }, []);

  const peopleIndex = useDbQuery(() => getPeopleIndex(getDb(), ctx.familyId), ['people', 'entries'], [ctx.familyId]);
  const search = useMemo(() => createPersonSearch(peopleIndex), [peopleIndex]);
  const contactSearch = useMemo(() => (Array.isArray(contacts) ? createPersonSearch(contacts) : null), [contacts]);
  const query = who === null ? nameText.trim() : '';
  const suggestions = useMemo(() => (query ? search(query, 5) : []), [search, query]);
  const contactHits = useMemo(() => {
    if (!query || !contactSearch) return [];
    const known = new Set(suggestions.map((p) => p.nameLatin));
    return contactSearch(query, 3).filter((c) => !known.has(c.nameLatin));
  }, [contactSearch, query, suggestions]);
  const last = useDbQuery(
    () => (who?.kind === 'existing' ? getLastExchange(getDb(), who.person.id) : undefined),
    ['entries'],
    [who],
  );

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader close />
        <EmptyState icon="alert-circle" title={t('eventDetail.notFound')} />
      </SafeAreaView>
    );
  }

  const amount = amountFromDigits(digits);
  const accent = directionColors[direction];

  function pickPerson(p: PersonMatch) {
    setWho({ kind: 'existing', person: p });
    setRelation(p.relation);
    setError(null);
    Keyboard.dismiss();
  }

  const askContacts = async () => {
    setContacts(await loadContacts());
  };

  const clearPerson = () => {
    setWho(null);
    setNewCity('');
    setNameText('');
    setRelation(null);
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const resolveWho = (): { personId: string | null; newPersonName: string | null } | null => {
    if (who?.kind === 'existing') return { personId: who.person.id, newPersonName: null };
    if (who?.kind === 'new') return { personId: null, newPersonName: who.name };
    const typed = nameText.trim();
    if (!typed) return { personId: null, newPersonName: null };
    // Typed a name without picking: reuse the one exact match, ask if there are several.
    const exact = exactKeyMatches(peopleIndex, typed);
    if (exact.length === 1) return { personId: exact[0]!.id, newPersonName: null };
    if (exact.length > 1) {
      setError({ field: 'newPersonName', message: t('errors.pickPerson') });
      return null;
    }
    return { personId: null, newPersonName: typed };
  };

  const save = (next: boolean) => {
    const person = resolveWho();
    if (!person) return;
    try {
      const write = (input: Parameters<typeof addEntry>[1]) =>
        editing ? updateEntry(ctx, editing.id, input) : addEntry(ctx, input);
      const res = write({
        eventId,
        ...person,
        newPersonCity: who?.kind === 'new' || person.newPersonName ? newCity || null : null,
        newPersonPhone: who?.kind === 'new' ? (who.phone ?? null) : null,
        relation,
        direction,
        amount,
        mode,
        itemNote: mode === 'item' ? itemNote : null,
        subFunction,
        note: note || null,
      });
      setSaved((n) => n + 1);
      setError(null);
      setToast(
        mode === 'item' && amount === 0
          ? t('quickEntry.toastItem', { name: res.person.displayName })
          : t('quickEntry.toast', { name: res.person.displayName, amount: formatINR(amount) }),
      );
      if (!next || editing) {
        router.back();
        return;
      }
      // Keep direction, function and mode; clear the guest.
      setWho(null);
      setNameText('');
      setNewCity('');
      setRelation(null);
      setDigits('');
      setItemNote('');
      setNote('');
      setShowNote(false);
      setTimeout(() => nameRef.current?.focus(), 50);
    } catch (e) {
      const field = e instanceof LedgerError ? e.field : undefined;
      setError({ field: field ?? 'form', message: errorMessage(field) });
    }
  };

  const nameError = error && ['newPersonName', 'personId'].includes(error.field) ? error.message : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader
        close
        subtitle={event.title}
        title={
          editing
            ? t('quickEntry.editTitle')
            : subFunction
              ? t(`subFunction.${subFunction}` as 'subFunction.haldi', { defaultValue: subFunction })
              : t(`eventType.${event.type}`)
        }
        right={
          saved > 0 ? (
            <View style={styles.savedPill} accessibilityLiveRegion="polite">
              <Feather name="check" size={15} color={colors.success} />
              <AppText variant="tiny" color={colors.success} style={{ fontSize: 13 }}>
                {t('quickEntry.savedCount', { count: saved })}
              </AppText>
            </View>
          ) : null
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Segmented<Direction>
            label={t('quickEntry.direction')}
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'received', label: t('direction.received'), accent: colors.received, icon: 'arrow-down-left' },
              { value: 'given', label: t('direction.given'), accent: colors.given, icon: 'arrow-up-right' },
            ]}
          />

          {event.subFunctions.length > 0 ? (
            <ChipRow>
              {event.subFunctions.map((f) => (
                <Chip
                  key={f}
                  tone="marigold"
                  label={t(`subFunction.${f}` as 'subFunction.haldi', { defaultValue: f })}
                  selected={subFunction === f}
                  onPress={() => {
                    setSubFunction(f);
                    rememberFn(eventId, f);
                  }}
                />
              ))}
            </ChipRow>
          ) : null}

          {/* Who */}
          <View style={{ gap: 6 }}>
            <AppText variant="label" color={colors.inkMuted}>
              {direction === 'received' ? t('quickEntry.from') : t('quickEntry.to')}
            </AppText>
            {who ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${who.kind === 'existing' ? who.person.displayName : who.name}. ${t('quickEntry.clearPerson')}`}
                  onPress={clearPerson}
                  style={styles.picked}
                >
                  <Avatar name={who.kind === 'existing' ? who.person.displayName : who.name} size={34} />
                  <AppText variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
                    {who.kind === 'existing' ? who.person.displayName : who.name}
                  </AppText>
                  {who.kind === 'existing' && who.person.city ? (
                    <View style={styles.cityTag}>
                      <AppText variant="tiny" color={colors.inkMuted} style={{ fontSize: 13 }}>
                        {who.person.city}
                      </AppText>
                    </View>
                  ) : null}
                  {who.kind === 'new' ? (
                    <View style={[styles.cityTag, { backgroundColor: colors.marigoldTint }]}>
                      <AppText variant="tiny" color={colors.marigoldInk} style={{ fontSize: 13 }}>
                        {t('quickEntry.newPerson')}
                      </AppText>
                    </View>
                  ) : null}
                  <Feather name="x" size={20} color={colors.inkMuted} />
                </Pressable>
                {who.kind === 'existing' ? (
                  <AppText variant="meta" color={colors.inkMuted}>
                    {last
                      ? t('quickEntry.last', {
                          who: last.direction === 'given' ? t('direction.youGave') : t('direction.theyGave'),
                          amount: last.mode === 'item' && !last.amount ? t('mode.item') : formatINR(last.amount),
                          event: last.eventTitle,
                        })
                      : t('quickEntry.noHistory')}
                  </AppText>
                ) : (
                  <View style={styles.newPersonExtra}>
                    {who.phone ? (
                      <AppText variant="caption" color={colors.inkMuted}>
                        {t('quickEntry.fromContact', { phone: who.phone })}
                      </AppText>
                    ) : null}
                    <TextInput
                      accessibilityLabel={t('quickEntry.cityLabel')}
                      placeholder={t('quickEntry.cityPlaceholder')}
                      placeholderTextColor={colors.placeholder}
                      value={newCity}
                      onChangeText={setNewCity}
                      autoCapitalize="words"
                      style={styles.cityInput}
                    />
                  </View>
                )}
              </>
            ) : (
              <>
                <TextInput
                  ref={nameRef}
                  accessibilityLabel={t('quickEntry.nameLabel')}
                  placeholder={t('quickEntry.namePlaceholder')}
                  placeholderTextColor={colors.placeholder}
                  value={nameText}
                  onChangeText={(v) => {
                    setNameText(v);
                    if (error) setError(null);
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  style={[styles.nameInput, nameError ? { borderColor: colors.danger, borderWidth: 2 } : null]}
                />
                {nameError ? (
                  <AppText variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
                    {nameError}
                  </AppText>
                ) : null}
                {nameText.trim() ? (
                  <View style={styles.suggestions} accessibilityRole="list">
                    {suggestions.map((p) => (
                      <Pressable
                        key={p.id}
                        accessibilityRole="button"
                        accessibilityLabel={[p.displayName, p.city, p.relation ? t(`relation.${p.relation}` as 'relation.friend', { defaultValue: p.relation }) : null].filter(Boolean).join(', ')}
                        onPress={() => pickPerson(p)}
                        style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.ground }]}
                      >
                        <Avatar name={p.displayName} size={36} />
                        <View style={{ flex: 1 }}>
                          <AppText variant="bodyStrong" weight="bold">
                            {p.displayName}
                          </AppText>
                          <AppText variant="caption" color={colors.inkMuted}>
                            {withArrows(
                              [
                                p.city,
                                p.relation ? t(`relation.${p.relation}` as 'relation.friend', { defaultValue: p.relation }) : null,
                                p.lastAmount !== null && p.lastDirection
                                  ? `${p.lastDirection === 'given' ? '↗' : '↙'} ${formatINR(p.lastAmount)}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || ' ',
                              13,
                            )}
                          </AppText>
                        </View>
                      </Pressable>
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('quickEntry.addNew', { name: nameText.trim() })}
                      onPress={() => {
                        setWho({ kind: 'new', name: nameText.trim().replace(/\s+/g, ' ') });
                        Keyboard.dismiss();
                      }}
                      style={({ pressed }) => [styles.suggestion, styles.addNew, pressed && { backgroundColor: colors.ground }]}
                    >
                      <Feather name="user-plus" size={20} color={colors.sindoor} />
                      <AppText variant="bodyStrong" weight="bold" color={colors.sindoor} style={{ flex: 1 }}>
                        {t('quickEntry.addNew', { name: nameText.trim() })}
                      </AppText>
                    </Pressable>
                    {contactHits.length > 0 ? (
                      <View style={styles.contactsBlock}>
                        <AppText variant="tiny" color={colors.inkMuted} style={styles.blockLabel}>
                          {t('quickEntry.fromContacts')}
                        </AppText>
                        {contactHits.map((c) => (
                          <Pressable
                            key={c.id}
                            accessibilityRole="button"
                            accessibilityLabel={[c.displayName, c.phone].filter(Boolean).join(', ')}
                            onPress={() => {
                              setWho({ kind: 'new', name: c.displayName, phone: c.phone });
                              Keyboard.dismiss();
                            }}
                            style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.ground }]}
                          >
                            <Feather name="smartphone" size={20} color={colors.inkMuted} />
                            <View style={{ flex: 1 }}>
                              <AppText variant="bodyStrong" weight="bold">
                                {c.displayName}
                              </AppText>
                              {c.phone ? (
                                <AppText variant="caption" color={colors.inkMuted}>
                                  {c.phone}
                                </AppText>
                              ) : null}
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {contacts === null ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('quickEntry.searchContacts')}
                        onPress={askContacts}
                        style={({ pressed }) => [styles.suggestion, styles.addNew, pressed && { backgroundColor: colors.ground }]}
                      >
                        <Feather name="book" size={20} color={colors.inkMuted} />
                        <AppText variant="label" color={colors.inkMuted} style={{ flex: 1 }}>
                          {t('quickEntry.searchContacts')}
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
          </View>

          <View style={{ gap: 6 }}>
            <AppText variant="label" color={colors.inkMuted}>
              {t('quickEntry.relation')}
            </AppText>
            <ChipRow>
              {RELATION_PRESETS.map((r) => (
                <Chip key={r} label={t(`relation.${r}`)} selected={relation === r} onPress={() => setRelation(relation === r ? null : r)} />
              ))}
            </ChipRow>
          </View>

          {/* Amount */}
          <View style={{ gap: 6 }}>
            <AppText variant="label" color={colors.inkMuted}>
              {mode === 'item' ? `${t('quickEntry.itemValue')} ${t('common.optional')}` : t('quickEntry.amount')}
            </AppText>
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={t('quickEntry.amountA11y', { amount })}
              accessibilityLiveRegion="polite"
              style={[styles.amountBox, { backgroundColor: accent.bg }, error?.field === 'amount' && { borderColor: colors.danger, borderWidth: 2 }]}
            >
              <AppText style={[styles.amountText, { color: digits ? accent.fg : colors.placeholder }]} tabular>
                ₹{groupINR(amount)}
              </AppText>
            </View>
            {error?.field === 'amount' ? (
              <AppText variant="caption" color={colors.danger}>
                {error.message}
              </AppText>
            ) : null}
          </View>

          <View accessibilityLabel={t('quickEntry.amountChips')} style={styles.chipsRow}>
            {AMOUNT_CHIPS.map((v) => {
              const on = amount === v;
              return (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityLabel={groupINR(v)}
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setDigits(String(v));
                    if (error?.field === 'amount') setError(null);
                  }}
                  style={[styles.amountChip, on && styles.amountChipOn]}
                >
                  <AppText variant="bodyStrong" weight={on ? 'extrabold' : 'bold'} color={on ? colors.onMarigold : colors.ink} style={{ fontSize: 15 }}>
                    {groupINR(v)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <Segmented<PaymentMode>
            label={t('quickEntry.mode')}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            options={[
              { value: 'cash', label: t('mode.cash') },
              { value: 'upi', label: t('mode.upi') },
              { value: 'cheque', label: t('mode.cheque') },
              { value: 'item', label: t('mode.item') },
            ]}
          />

          {mode === 'item' ? (
            <Field
              label={t('quickEntry.itemLabel')}
              placeholder={t('quickEntry.itemPlaceholder')}
              value={itemNote}
              onChangeText={(v) => {
                setItemNote(v);
                setError(null);
              }}
              error={error?.field === 'itemNote' ? error.message : null}
            />
          ) : null}

          {showNote ? (
            <Field label={t('quickEntry.note')} placeholder={t('quickEntry.notePlaceholder')} value={note} onChangeText={setNote} autoFocus multiline />
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={t('quickEntry.addNote')} onPress={() => setShowNote(true)} style={styles.noteButton}>
              <Feather name="file-text" size={18} color={colors.ink} />
              <AppText variant="label" weight="bold">
                {t('quickEntry.addNote')}
              </AppText>
            </Pressable>
          )}

          {error?.field === 'form' || error?.field === 'eventId' ? (
            <AppText variant="caption" color={colors.danger} align="center">
              {error.message}
            </AppText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {toast ? (
        <View style={[styles.toast, { top: insets.top + 64 }]} accessibilityLiveRegion="polite" pointerEvents="none">
          <Feather name="check" size={20} color="#7FD3A5" />
          <AppText variant="bodyStrong" color={colors.surface} style={{ flex: 1 }} numberOfLines={2}>
            {toast}
          </AppText>
        </View>
      ) : null}

      {!keyboardOpen ? (
        <View style={styles.bottom}>
          <Keypad
            onKey={(k) => {
              setDigits((d) => (k === 'clear' ? '' : pressAmountKey(d, k)));
              if (error?.field === 'amount') setError(null);
            }}
          />
          <View style={styles.actions}>
            {editing ? (
              <Button label={t('quickEntry.saveChanges')} onPress={() => save(false)} style={{ flex: 1 }} />
            ) : (
              <>
                <Button label={t('quickEntry.save')} variant="secondary" onPress={() => save(false)} style={{ flex: 1 }} />
                <Button label={t('quickEntry.saveNext')} iconRight="arrow-right" onPress={() => save(true)} style={{ flex: 2 }} />
              </>
            )}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 14 },
  savedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.successTint,
    marginRight: space.xs,
  },
  picked: {
    minHeight: 54,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingLeft: 10,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cityTag: { height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.ground, justifyContent: 'center' },
  nameInput: {
    minHeight: 54,
    borderRadius: radius.input,
    borderWidth: 2,
    borderColor: colors.sindoor,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 18,
    color: colors.ink,
  },
  suggestions: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', backgroundColor: colors.surface },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.md, paddingVertical: space.sm },
  addNew: { borderTopWidth: 1, borderTopColor: colors.line },
  contactsBlock: { borderTopWidth: 1, borderTopColor: colors.line },
  blockLabel: { paddingHorizontal: space.md, paddingTop: space.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  newPersonExtra: { gap: 6 },
  cityInput: {
    minHeight: 46,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  amountBox: { borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 4 },
  amountText: { fontFamily: fonts.extrabold, fontSize: 42, lineHeight: 54 },
  chipsRow: { flexDirection: 'row', gap: 6 },
  amountChip: {
    flex: 1,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountChipOn: { backgroundColor: colors.marigold, borderColor: colors.marigold },
  noteButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
  },
  bottom: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', gap: 10 },
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    top: 64,
    backgroundColor: colors.ink,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
});
