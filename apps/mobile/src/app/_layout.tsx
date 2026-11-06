import '@/i18n';
import {
  Mukta_400Regular,
  Mukta_500Medium,
  Mukta_600SemiBold,
  Mukta_700Bold,
  Mukta_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/mukta';
import { RozhaOne_400Regular } from '@expo-google-fonts/rozha-one';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import migrations from '../../drizzle/migrations';
import { AppText } from '@/components/AppText';
import { getDb, prepareDatabase } from '@/db/client';
import { BootSplash } from '@/components/BootSplash';
import { LockScreen } from '@/components/LockScreen';
import { SyncDriver } from '@/components/SyncDriver';
import { startSession } from '@/lib/account';
import { useAppLock, watchAppLock } from '@/lib/appLock';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

void SplashScreen.preventAutoHideAsync();

/**
 * Opens the database and loads fonts while the opening splash plays over everything,
 * then hands over to the app. The splash lifts once it has played and the app is ready.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Mukta_400Regular,
    Mukta_500Medium,
    Mukta_600SemiBold,
    Mukta_700Bold,
    Mukta_800ExtraBold,
    RozhaOne_400Regular,
  });
  const fontsReady = fontsLoaded || !!fontError;
  const [dbState, setDbState] = useState<'opening' | 'open' | 'failed'>('opening');
  const [appReady, setAppReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const onAppReady = useCallback(() => setAppReady(true), []);
  const onSplashDone = useCallback(() => setSplashDone(true), []);
  useEffect(() => {
    prepareDatabase().then(
      () => setDbState('open'),
      () => setDbState('failed'),
    );
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {dbState === 'failed' ? <DatabaseError /> : dbState === 'open' && fontsReady ? <App onReady={onAppReady} /> : null}
      {splashDone ? null : <BootSplash fontsReady={fontsReady} appReady={appReady || dbState === 'failed'} onDone={onSplashDone} />}
    </View>
  );
}

function App({ onReady }: { onReady: () => void }) {
  const migration = useMigrations(getDb(), migrations);
  const authStatus = useSession((s) => s.authStatus);
  const deviceId = useSession((s) => s.deviceId);
  const family = useSession((s) => s.family);
  const locked = useAppLock((s) => s.locked);

  useEffect(() => {
    if (migration.success) void startSession();
  }, [migration.success]);
  useEffect(() => watchAppLock(), []);

  const signedIn = authStatus === 'signedIn';
  const ready = deviceId !== null && authStatus !== 'loading';
  useEffect(() => {
    if (ready || migration.error) onReady();
  }, [ready, migration.error, onReady]);

  if (migration.error) return <DatabaseError />;
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SyncDriver />
      {/* While locked, screen readers can't reach the ledger under the lock screen either. */}
      <View style={{ flex: 1 }} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={locked}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
          <Stack.Protected guard={signedIn && family !== null}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="events/new" />
            <Stack.Screen name="events/[id]/index" />
            <Stack.Screen name="events/[id]/entry" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="events/[id]/cash" />
            <Stack.Screen name="people/[id]/index" />
            <Stack.Screen name="people/[id]/edit" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="people/duplicates" />
            <Stack.Screen name="people/merge" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="scan-invite" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="family/index" />
            <Stack.Screen name="family/switch" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="family/add" />
            <Stack.Screen name="family/rename" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="family/member/[userId]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="family/hand-over" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="family/delete" options={{ animation: 'slide_from_bottom' }} />
          </Stack.Protected>
          {/* Reachable with no ledger too, so nobody needs one in order to delete their account. */}
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="account/delete" options={{ animation: 'slide_from_bottom' }} />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && family === null}>
            <Stack.Screen name="setup" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </View>
      {locked ? <LockScreen /> : null}
    </SafeAreaProvider>
  );
}

function DatabaseError() {
  const { t } = useTranslation();
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: space.xxl, backgroundColor: colors.surface }}>
      <AppText variant="rowTitle" align="center">
        {t('common.dbError')}
      </AppText>
    </View>
  );
}
