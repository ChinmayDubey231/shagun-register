import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Feather } from '@expo/vector-icons';
import { Button } from './Button';
import { EmptyState, ScreenHeader } from './layout';
import { colors, space } from '@/theme';

/** Placeholder for a route that exists in the navigation map but is built in a later week. */
export function NotYet({
  icon,
  body,
  action,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader close />
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl }}>
        <EmptyState
          icon={icon}
          title={t('later.title')}
          body={body}
          action={action ? <Button label={action.label} onPress={action.onPress} style={{ alignSelf: 'stretch', marginTop: space.md }} /> : null}
        />
      </View>
    </SafeAreaView>
  );
}
