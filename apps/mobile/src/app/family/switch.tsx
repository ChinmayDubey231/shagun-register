import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Divider, ListGroup, ScreenHeader } from '@/components/layout';
import { switchLedger } from '@/lib/account';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

/** Lists this account's ledgers on the phone; tap one to switch. */
export default function SwitchLedgerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const families = useSession((s) => s.families);
  const current = useSession((s) => s.family?.id);
  const roleLabel = { owner: t('family.roleOwner'), editor: t('family.roleEditor'), viewer: t('family.roleViewer') };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top', 'bottom']}>
      <ScreenHeader close title={t('switcher.title')} />
      <ScrollView contentContainerStyle={styles.body}>
        <ListGroup>
          {families.map((f, i) => {
            const on = f.id === current;
            return (
              <View key={f.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${f.name}, ${roleLabel[f.role]}`}
                  onPress={() => {
                    switchLedger(f.id);
                    router.back();
                  }}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.ground }]}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="rowTitle">{f.name}</AppText>
                    <AppText variant="caption" color={colors.inkMuted}>
                      {roleLabel[f.role]}
                      {f.registered ? '' : ` · ${t('switcher.pending')}`}
                    </AppText>
                  </View>
                  {on ? <Feather name="check" size={22} color={colors.sindoor} /> : null}
                </Pressable>
              </View>
            );
          })}
        </ListGroup>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('switcher.add')}
          onPress={() => router.push('/family/add')}
          style={({ pressed }) => [styles.add, pressed && { backgroundColor: colors.sindoorTint }]}
        >
          <Feather name="plus" size={20} color={colors.sindoor} />
          <AppText variant="bodyStrong" weight="bold" color={colors.sindoor}>
            {t('switcher.add')}
          </AppText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl, gap: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.lg, paddingVertical: space.sm },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.sindoor,
  },
});
