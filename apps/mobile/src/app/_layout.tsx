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
import { loadLocalSetup } from '@/db/ledger';
import { newId, useSession } from '@/store/session';
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
  const deviceId = useSession((s) => s.deviceId);
  const family = useSession((s) => s.family);
  const setSetup = useSession((s) => s.setSetup);

  useEffect(() => {
    if (!migration.success) return;
    const setup = loadLocalSetup(getDb(), newId);
    setSetup(setup.deviceId, setup.family);
  }, [migration.success, setSetup]);

  const ready = (fontsLoaded || !!fontError) && deviceId !== null;
  useEffect(() => {
    if (ready || migration.error) void SplashScreen.hideAsync();
  }, [ready, migration.error]);

  if (migration.error) return <DatabaseError />;
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
        <Stack.Protected guard={family !== null}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="events/new" />
          <Stack.Screen name="events/[id]/index" />
          <Stack.Screen name="events/[id]/entry" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="events/[id]/cash" />
          <Stack.Screen name="people/[id]/index" />
          <Stack.Screen name="people/[id]/edit" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="scan-invite" options={{ animation: 'slide_from_bottom' }} />
        </Stack.Protected>
        <Stack.Protected guard={family === null}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
      </Stack>
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
