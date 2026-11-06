import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { unlock } from '@/lib/appLock';
import { useBoot } from '@/store/boot';
import { colors, fonts, space } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';

/**
 * Covers the app while it is locked; the screens stay where they were underneath. Asks for
 * the phone's fingerprint, face or PIN as soon as it shows (after the opening splash on a cold
 * start), and again from the button.
 */
export function LockScreen() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const outcome = await unlock();
    setBusy(false);
    if (outcome === 'lockout') setMessage(t('lock.lockout'));
    else if (outcome === 'failed') setMessage(t('lock.failed'));
  }, [t]);

  // On a cold start, ask only once the opening splash lifts, so the prompt isn't drawn over it.
  const revealed = useBoot((s) => s.revealed);
  useEffect(() => {
    if (revealed) void tryUnlock();
  }, [revealed, tryUnlock]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.middle}>
          <View style={styles.mark} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <AppText style={styles.markText} color={colors.surface}>
              श
            </AppText>
          </View>
          <AppText variant="title" align="center" accessibilityRole="header">
            {t('lock.title')}
          </AppText>
          <AppText variant="body" color={colors.inkMuted} align="center">
            {t('lock.body')}
          </AppText>
        </View>
        {message ? (
          <AppText variant="meta" color={colors.danger} align="center" accessibilityLiveRegion="polite">
            {message}
          </AppText>
        ) : null}
        <Button label={t('lock.unlock')} icon="unlock" busy={busy} onPress={() => void tryUnlock()} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: space.xxl, gap: space.lg },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.sindoor,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  markText: { fontFamily: fonts.wordmark, fontSize: 40, lineHeight: 56 },
});
