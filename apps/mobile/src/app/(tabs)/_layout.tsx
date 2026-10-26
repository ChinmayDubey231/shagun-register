import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '@/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.sindoor,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        tabBarStyle: { borderTopColor: colors.line, backgroundColor: colors.surface, minHeight: 64 },
        sceneStyle: { backgroundColor: colors.ground },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color as string} /> }}
      />
      <Tabs.Screen
        name="events"
        options={{ title: t('tabs.events'), tabBarIcon: ({ color }) => <Feather name="calendar" size={22} color={color as string} /> }}
      />
      <Tabs.Screen
        name="people"
        options={{ title: t('tabs.people'), tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color as string} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('tabs.more'), tabBarIcon: ({ color }) => <Feather name="menu" size={22} color={color as string} /> }}
      />
    </Tabs>
  );
}
