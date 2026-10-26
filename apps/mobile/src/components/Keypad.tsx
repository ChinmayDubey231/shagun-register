import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { AppText } from './AppText';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const;

/** Amount keypad, so entering a gift never waits for the system keyboard. */
export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.grid}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          accessibilityRole="button"
          accessibilityLabel={k === 'back' ? t('quickEntry.keyDelete') : k}
          onPress={() => onKey(k)}
          onLongPress={k === 'back' ? () => onKey('clear') : undefined}
          style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.lineStrong }]}
        >
          {k === 'back' ? (
            <Feather name="delete" size={24} color={colors.ink} />
          ) : (
            <AppText variant="title" weight="bold" style={{ fontSize: 22, lineHeight: 28 }}>
              {k}
            </AppText>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  key: {
    width: '31%',
    flexGrow: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

