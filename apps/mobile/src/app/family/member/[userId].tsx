import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentProps, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card, Divider, ListGroup, ListRow, ScreenHeader } from '@/components/layout';
import { Avatar } from '@/components/ledger';
import { apiErrorMessage } from '@/i18n';
import { api } from '@/lib/api';
import { formatDate, todayISO } from '@/lib/format';
import { useSession } from '@/store/session';
import { colors, radius, space } from '@/theme';

type Role = 'editor' | 'viewer';

/**
 * Owner only: one member's role, and removing them. Picking a role and saving it are
 * separate steps, and so are asking to remove someone and confirming it.
 */
export default function MemberScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const family = useSession((s) => s.family);
  const params = useLocalSearchParams<{ userId: string; name: string; email: string; role: string; joinedAt?: string }>();
  const current: Role = params.role === 'viewer' ? 'viewer' : 'editor';
  const [chosen, setChosen] = useState<Role>(current);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  if (!family) return null;

  const name = params.name ?? '';
  const joinedAt = Number(params.joinedAt);
  const memberUrl = `/families/${family.id}/members/${params.userId}`;
  const changed = chosen !== current;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(memberUrl, { method: 'PATCH', body: { role: chosen } });
      router.back();
    } catch (e) {
      setError(apiErrorMessage(e));
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await api(memberUrl, { method: 'DELETE' });
      router.back();
    } catch (e) {
      setError(apiErrorMessage(e));
      setRemoving(false);
    }
  };

  const options: { role: Role; icon: ComponentProps<typeof Feather>['name']; title: string; detail: string }[] = [
    { role: 'editor', icon: 'edit-3', title: t('family.roleEditor'), detail: t('family.roleEditorDetail') },
    { role: 'viewer', icon: 'eye', title: t('family.roleViewer'), detail: t('family.roleViewerDetail') },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader title={t('family.memberTitle')} subtitle={family.name} close />
      <ScrollView ref={scroll} style={{ backgroundColor: colors.ground }} contentContainerStyle={styles.body}>
        <Card style={styles.who}>
          <Avatar name={name} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="section" weight="extrabold" numberOfLines={2}>
              {name}
            </AppText>
            <AppText variant="meta" color={colors.inkMuted} numberOfLines={1}>
              {params.email}
            </AppText>
            {Number.isFinite(joinedAt) && joinedAt > 0 ? (
              <AppText variant="caption" color={colors.inkSubtle}>
                {t('family.joined', { when: formatDate(todayISO(new Date(joinedAt))) })}
              </AppText>
            ) : null}
          </View>
        </Card>

        <View style={{ gap: space.sm }}>
          <AppText variant="label" color={colors.inkMuted} accessibilityRole="header">
            {t('family.roleLabel')}
          </AppText>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('family.roleLabel')} style={{ gap: space.sm }}>
            {options.map((o) => {
              const on = chosen === o.role;
              const now = current === o.role;
              return (
                <Pressable
                  key={o.role}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${o.title}, ${o.detail}${now ? `, ${t('family.roleCurrent')}` : ''}`}
                  onPress={() => {
                    setChosen(o.role);
                    setError(null);
                  }}
                  style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && !on && { backgroundColor: colors.ground }]}
                >
                  <View style={[styles.optionIcon, on && { backgroundColor: colors.sindoor }]}>
                    <Feather name={o.icon} size={20} color={on ? colors.surface : colors.sindoor} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={styles.optionTitle}>
                      <AppText variant="rowTitle">{o.title}</AppText>
                      {now ? (
                        <View style={styles.nowTag}>
                          <AppText variant="tiny" color={colors.marigoldInk}>
                            {t('family.roleCurrent')}
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                    <AppText variant="meta" color={colors.inkMuted}>
                      {o.detail}
                    </AppText>
                  </View>
                  <Feather name={on ? 'check-circle' : 'circle'} size={24} color={on ? colors.sindoor : colors.lineStrong} />
                </Pressable>
              );
            })}
          </View>
        </View>

        {error && !confirmRemove ? (
          <AppText variant="meta" color={colors.danger} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}

        <Button
          label={!changed ? t('family.saveRole') : chosen === 'editor' ? t('family.makeEditorNamed', { name }) : t('family.makeViewerNamed', { name })}
          disabled={!changed || removing}
          busy={saving}
          onPress={() => void save()}
        />

        <ListGroup>
          <ListRow
            icon="user-check"
            label={t('family.makeOwner', { name })}
            onPress={() => router.replace({ pathname: '/family/hand-over', params: { userId: params.userId } })}
          />
          <Divider />
          <ListRow
            icon="user-x"
            label={t('family.remove')}
            danger
            onPress={() => {
              setConfirmRemove(true);
              setError(null);
            }}
          />
        </ListGroup>

        {confirmRemove ? (
          // It opens below the fold on a small phone, so bring it into view.
          <View onLayout={() => scroll.current?.scrollToEnd({ animated: true })}>
            <Card style={styles.confirm}>
              <AppText variant="bodyStrong">{t('family.removeConfirm', { name })}</AppText>
              {error ? (
                <AppText variant="meta" color={colors.danger} accessibilityLiveRegion="polite">
                  {error}
                </AppText>
              ) : null}
              <Button label={t('family.removeNamed', { name })} variant="danger" size="medium" icon="user-x" busy={removing} disabled={saving} onPress={() => void remove()} />
              <Button label={t('common.cancel')} variant="quiet" size="medium" disabled={removing} onPress={() => setConfirmRemove(false)} />
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 76,
    padding: 14,
    borderRadius: radius.button,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.sindoor },
  optionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.sindoorTint, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  nowTag: { paddingHorizontal: space.sm, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.marigoldTint },
  confirm: { gap: space.md, borderColor: colors.dangerTint, backgroundColor: '#FFF8F7' },
});
