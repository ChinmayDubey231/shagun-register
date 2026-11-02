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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import migrations from '../../drizzle/migrations';
import { AppText } from '@/components/AppText';
import { getDb, prepareDatabase } from '@/db/client';
import { LockScreen } from '@/components/LockScreen';
import { SyncDriver } from '@/components/SyncDriver';
import { startSession } from '@/lib/account';
import { useAppLock, watchAppLock } from '@/lib/appLock';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

void SplashScreen.preventAutoHideAsync();

/** Opens the database, then hands over to the app. The splash screen stays up meanwhile. */
export default function RootLayout() {
  const [dbState, setDbState] = useState<'opening' | 'open' | 'failed'>('opening');
  useEffect(() => {
    prepareDatabase().then(
      () => setDbState('open'),
      () => setDbState('failed'),
    );
  }, []);
  if (dbState === 'failed') return <DatabaseError />;
  if (dbState === 'opening') return null;
  return <App />;
}

function App() {
  const [fontsLoaded, fontError] = useFonts({
    Mukta_400Regular,
    Mukta_500Medium,
    Mukta_600SemiBold,
    Mukta_700Bold,
    Mukta_800ExtraBold,
    RozhaOne_400Regular,
  });
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
  const ready = (fontsLoaded || !!fontError) && deviceId !== null && authStatus !== 'loading';
  useEffect(() => {
    if (ready || migration.error) void SplashScreen.hideAsync();
  }, [ready, migration.error]);

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
