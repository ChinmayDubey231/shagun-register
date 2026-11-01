import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InviteText } from '../../modules/invite-text';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card, Divider, ScreenHeader } from '@/components/layout';
import { formatDate, todayISO } from '@/lib/format';
import { draftTitle, mergeReadings, parseInvite, type InviteDraft } from '@/scan/parseInvite';
import { colors, radius, space } from '@/theme';

type State =
  | { step: 'choose'; message?: string }
  | { step: 'reading'; uri: string }
  | { step: 'read'; uri: string; lines: string[]; draft: InviteDraft; title: string };

/**
 * Photograph an invite card (or pick one from the gallery), read it on the phone with
 * ML Kit, and open the new-event form filled in. The photo stays in the app's cache.
 */
export default function ScanInviteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [state, setState] = useState<State>({ step: 'choose' });
  const [showText, setShowText] = useState(false);

  const read = async (from: 'camera' | 'gallery') => {
    if (!InviteText) return;
    if (from === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      setState({ step: 'choose', message: t('scan.cameraDenied') });
      return;
    }
    const picked =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
    const uri = picked.assets?.[0]?.uri;
    if (picked.canceled || !uri) return;
    setState({ step: 'reading', uri });
    try {
      const lines = mergeReadings(await InviteText.recognize(uri));
      const draft = parseInvite(lines, todayISO());
      setShowText(false);
      setState({ step: 'read', uri, lines, draft, title: draftTitle(draft, t) });
    } catch {
      setState({ step: 'choose', message: t('scan.failed') });
    }
  };

  const fill = (s: Extract<State, { step: 'read' }>) =>
    router.replace({
      pathname: '/events/new',
      params: {
        fromCard: '1',
        title: s.title,
        type: s.draft.type ?? '',
        date: s.draft.date ?? '',
        venue: s.draft.venue ?? '',
        hostName: s.draft.hostName ?? '',
        subFunctions: JSON.stringify(s.draft.subFunctions),
      },
    });

  const typeInstead = () => router.replace('/events/new');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader close title={t('scan.title')} />
      <ScrollView style={{ backgroundColor: colors.ground }} contentContainerStyle={styles.body}>
        {state.step === 'choose' ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Feather name="camera" size={28} color={colors.sindoor} />
              </View>
              <AppText variant="meta" color={colors.inkMuted} align="center">
                {InviteText ? t('scan.body') : t('scan.unavailable')}
              </AppText>
            </View>
            {state.message ? (
              <AppText variant="meta" color={colors.danger} align="center" accessibilityLiveRegion="polite">
                {state.message}
              </AppText>
            ) : null}
            {InviteText ? (
              <>
                <Button label={t('scan.takePhoto')} icon="camera" onPress={() => void read('camera')} />
                <Button label={t('scan.pickPhoto')} icon="image" variant="secondary" onPress={() => void read('gallery')} />
              </>
            ) : null}
            <Button label={t('scan.typeInstead')} variant="quiet" size="medium" onPress={typeInstead} />
          </>
        ) : (
          <>
            <Image source={{ uri: state.uri }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
            {state.step === 'reading' ? (
              <View style={styles.reading} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.sindoor} />
                <AppText variant="bodyStrong">{t('scan.reading')}</AppText>
              </View>
            ) : (
              <Found state={state} showText={showText} onToggleText={() => setShowText((v) => !v)} />
            )}
          </>
        )}
      </ScrollView>
      {state.step === 'read' ? (
        <View style={styles.footer}>
          <Button label={t('scan.useDetails')} iconRight="arrow-right" onPress={() => fill(state)} />
          <Button label={t('scan.tryAnother')} variant="quiet" size="medium" onPress={() => setState({ step: 'choose' })} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Found({
  state,
  showText,
  onToggleText,
}: {
  state: Extract<State, { step: 'read' }>;
  showText: boolean;
  onToggleText: () => void;
}) {
  const { t } = useTranslation();
  const { draft, title, lines } = state;
  const rows = [
    { label: t('createEvent.nameLabel'), value: title },
    { label: t('createEvent.type'), value: draft.type ? t(`eventType.${draft.type}`) : '' },
    { label: t('createEvent.date'), value: draft.date ? formatDate(draft.date) : '' },
    { label: t('createEvent.host'), value: draft.hostName ?? '' },
    { label: t('createEvent.venue'), value: draft.venue ?? '' },
    {
      label: t('createEvent.functions'),
      value: draft.subFunctions.map((f) => t(`subFunction.${f}` as 'subFunction.haldi', { defaultValue: f })).join(', '),
    },
  ].filter((r) => r.value);

  return (
    <>
      {rows.length ? (
        <Card padded={false}>
          <View style={styles.foundHead}>
            <AppText variant="eyebrow" color={colors.marigoldInk}>
              {t('scan.found')}
            </AppText>
            <AppText variant="caption" color={colors.inkMuted}>
              {t('scan.foundHint')}
            </AppText>
          </View>
          {rows.map((r) => (
            <View key={r.label}>
              <Divider />
              <View style={styles.row} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
                <AppText variant="caption" color={colors.inkMuted} style={styles.rowLabel}>
                  {r.label}
                </AppText>
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {r.value}
                </AppText>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <AppText variant="meta" color={colors.inkMuted} align="center">
          {t('scan.nothingFound')}
        </AppText>
      )}
      {lines.length ? (
        <Card padded={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showText }}
            onPress={onToggleText}
            style={styles.textToggle}
          >
            <AppText variant="label" style={{ flex: 1 }}>
              {t('scan.cardText')}
            </AppText>
            <Feather name={showText ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
          </Pressable>
          {showText ? (
            <AppText variant="meta" color={colors.inkMuted} selectable style={styles.cardText}>
              {lines.join('\n')}
            </AppText>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl, gap: space.md, flexGrow: 1 },
  hero: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.md },
  heroIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.sindoorTint, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: 220, borderRadius: radius.card, backgroundColor: colors.lineStrong },
  reading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.xl },
  foundHead: { padding: 14, gap: 2 },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: 14, paddingVertical: space.md },
  rowLabel: { width: 84, paddingTop: 2 },
  textToggle: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14 },
  cardText: { paddingHorizontal: 14, paddingBottom: 14 },
  footer: { padding: space.xl, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line, gap: space.sm, backgroundColor: colors.surface },
});
