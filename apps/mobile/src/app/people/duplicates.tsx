import { Feather } from '@expo/vector-icons';
import { pairKey } from '@shagun/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card, Divider, EmptyState, ScreenHeader } from '@/components/layout';
import { PersonTotals } from '@/components/ledger';
import { getDb } from '@/db/client';
import { getDuplicateSuggestions, markNotDuplicates } from '@/db/ledger';
import { useDbQuery } from '@/db/useDbQuery';
import { useFamilyId } from '@/store/session';
import { colors, space } from '@/theme';

/** People who are probably the same household. Nothing merges until the family reviews it. */
export default function DuplicatesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const familyId = useFamilyId();
  const pairs = useDbQuery(() => getDuplicateSuggestions(getDb(), familyId), ['people', 'entries', 'app_settings'], [familyId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScreenHeader title={t('duplicates.title')} />
      <FlatList
        style={{ backgroundColor: colors.ground }}
        contentContainerStyle={styles.list}
        data={pairs}
        keyExtractor={(p) => pairKey(p.a.id, p.b.id)}
        ListHeaderComponent={
          pairs.length > 0 ? (
            <AppText variant="meta" color={colors.inkMuted}>
              {t('duplicates.hint')}
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={<EmptyState icon="check-circle" title={t('duplicates.emptyTitle')} body={t('duplicates.emptyBody')} />}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        renderItem={({ item }) => (
          <Card padded={false}>
            <View style={styles.reason}>
              <Feather name={item.reason === 'samePhone' ? 'phone' : 'users'} size={14} color={colors.marigoldInk} />
              <AppText variant="eyebrow" color={colors.marigoldInk}>
                {t(`duplicates.${item.reason}`)}
              </AppText>
            </View>
            <PersonTotals person={item.a} />
            <Divider />
            <PersonTotals person={item.b} />
            <View style={styles.actions}>
              <Button
                label={t('duplicates.notSame')}
                variant="quiet"
                size="medium"
                style={{ flex: 1 }}
                onPress={() => markNotDuplicates(getDb(), item.a.id, item.b.id)}
              />
              <Button
                label={t('duplicates.review')}
                size="medium"
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/people/merge', params: { a: item.a.id, b: item.b.id } })}
              />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.xl, gap: space.md, flexGrow: 1 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: space.md },
  actions: { flexDirection: 'row', gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: colors.line },
});
