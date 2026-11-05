import { Feather } from '@expo/vector-icons';
import type { FamilyDetail, FamilyMember } from '@shagun/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Divider, ListGroup, ScreenHeader } from '@/components/layout';
import { Avatar } from '@/components/ledger';
import { apiErrorMessage } from '@/i18n';
import { handOverLedger } from '@/lib/account';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { colors, space } from '@/theme';

/** Owner only. Choosing a member and confirming are separate steps, so one mistaken tap can't give the ledger away. */
export default function HandOverLedgerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const family = useSession((s) => s.family);
  const familyId = family?.id;
  const [others, setOthers] = useState<FamilyMember[] | null>(null);
  const [chosen, setChosen] = useState<FamilyMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) return;
    api<FamilyDetail>(`/families/${familyId}`).then(
      (d) => setOthers(d.members.filter((m) => m.role !== 'owner')),
      (e: unknown) => setError(apiErrorMessage(e)),
    );
  }, [familyId]);

  if (!family) return null;

  const confirm = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await handOverLedger(family.id, chosen.userId);
      router.back();
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader title={t('family.handOver')} subtitle={family.name} close />
      <ScrollView style={{ backgroundColor: colors.ground }} contentContainerStyle={styles.body}>
        <AppText color={colors.inkMuted}>{t('family.handOverBody')}</AppText>
        {error ? (
          <AppText variant="meta" color={colors.danger} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}
        {others === null && !error ? <ActivityIndicator color={colors.sindoor} /> : null}
        {others?.length === 0 ? <AppText variant="bodyStrong">{t('family.handOverNoOne')}</AppText> : null}
        {others?.length ? (
          <ListGroup>
            {others.map((m, i) => {
              const selected = chosen?.userId === m.userId;
              return (
                <View key={m.userId}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${m.name}, ${m.email}`}
                    onPress={() => setChosen(m)}
                    style={({ pressed }) => [styles.member, pressed && { backgroundColor: colors.ground }]}
                  >
                    <Avatar name={m.name} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="bodyStrong" weight="bold" numberOfLines={1}>
                        {m.name}
                      </AppText>
                      <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
                        {m.email}
                      </AppText>
                    </View>
                    <Feather name={selected ? 'check-circle' : 'circle'} size={22} color={selected ? colors.sindoor : colors.lineStrong} />
                  </Pressable>
                </View>
              );
            })}
          </ListGroup>
        ) : null}
        {chosen ? <Button label={t('family.handOverTo', { name: chosen.name })} size="medium" busy={busy} onPress={() => void confirm()} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  member: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 14, paddingVertical: space.md, minHeight: 64 },
});
