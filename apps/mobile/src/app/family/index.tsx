import { Feather } from '@expo/vector-icons';
import type { FamilyDetail, FamilyMember, InviteResponse } from '@shagun/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Choice';
import { Card, Divider, ListGroup, ListRow, ScreenHeader } from '@/components/layout';
import { Avatar } from '@/components/ledger';
import { apiErrorMessage } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { syncAccount } from '@/lib/account';
import { formatShortDateTime } from '@/lib/format';
import { useSession } from '@/store/session';
import { colors, fonts, radius, space } from '@/theme';

type InviteRole = 'editor' | 'viewer';

const roleTone = {
  owner: { bg: colors.marigoldTint, fg: colors.marigoldInk },
  editor: { bg: colors.sindoorTint, fg: colors.sindoor },
  viewer: { bg: colors.ground, fg: colors.inkMuted },
} as const;

/** Members, roles and invite codes (design board 14). Needs the internet; the ledger itself doesn't. */
export default function FamilyMembersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const family = useSession((s) => s.family);
  const me = useSession((s) => s.user);
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [invites, setInvites] = useState<InviteResponse[]>([]);
  const [inviteRole, setInviteRole] = useState<InviteRole>('editor');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [making, setMaking] = useState(false);

  const roleLabel = { owner: t('family.roleOwner'), editor: t('family.roleEditor'), viewer: t('family.roleViewer') };
  const isOwner = family?.role === 'owner';

  const load = useCallback(async () => {
    if (!family) return;
    setLoading(true);
    setError(null);
    try {
      if (!family.registered) await syncAccount();
      const d = await api<FamilyDetail>(`/families/${family.id}`);
      setDetail(d);
      setInvites(d.role === 'owner' ? await api<InviteResponse[]>(`/families/${family.id}/invites`) : []);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NETWORK') setOffline(true);
      else setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [family]);

  // Also on coming back from a member's screen, so a changed role or a removal shows at once.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const pullToRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!family) return null;

  const makeInvite = async () => {
    setMaking(true);
    setError(null);
    try {
      const inv = await api<InviteResponse>(`/families/${family.id}/invites`, { method: 'POST', body: { role: inviteRole } });
      setInvites((cur) => [inv, ...cur]);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setMaking(false);
    }
  };

  const share = (code: string) =>
    Share.share({ message: t('family.shareMessage', { name: family.name, code }) }).catch(() => undefined);

  const cancelInvite = async (code: string) => {
    try {
      await api(`/families/${family.id}/invites/${code}`, { method: 'DELETE' });
      setInvites((cur) => cur.filter((i) => i.code !== code));
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  };

  const openMember = (m: FamilyMember) =>
    router.push({
      pathname: '/family/member/[userId]',
      params: { userId: m.userId, name: m.name, email: m.email, role: m.role, joinedAt: String(m.joinedAt) },
    });

  const leave = () =>
    Alert.alert(t('family.leave'), t('family.leaveConfirm', { name: family.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('family.leave'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/families/${family.id}/members/${me!.id}`, { method: 'DELETE' });
            await syncAccount(); // removes the ledger and its records from this phone
            router.dismissTo('/');
          } catch (e) {
            setError(apiErrorMessage(e));
          }
        },
      },
    ]);

  const subtitle = detail ? t('family.membersCount', { name: family.name, count: detail.members.length }) : family.name;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom']}>
      <ScreenHeader title={t('family.title')} subtitle={subtitle} />
      <ScrollView
        style={{ backgroundColor: colors.ground }}
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pullToRefresh()} />}
      >
        {offline ? (
          <Card style={styles.notice}>
            <Feather name="wifi-off" size={22} color={colors.marigoldInk} />
            <AppText variant="meta" style={{ flex: 1 }}>
              {family.registered ? t('family.offline') : t('family.notRegistered')}
            </AppText>
            <Button label={t('family.retry')} variant="quiet" size="medium" onPress={load} style={{ height: 44 }} />
          </Card>
        ) : null}
        {error ? (
          <AppText variant="meta" color={colors.danger} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}
        {loading && !detail && !offline ? <ActivityIndicator color={colors.sindoor} style={{ marginTop: space.xl }} /> : null}

        {detail && isOwner ? (
          <Card style={{ gap: space.md }}>
            <AppText variant="rowTitle" accessibilityRole="header">
              {t('family.inviteTitle')}
            </AppText>
            <Segmented<InviteRole>
              label={t('family.inviteTitle')}
              value={inviteRole}
              onChange={setInviteRole}
              options={[
                { value: 'editor', label: t('family.roleEditor'), sublabel: t('family.roleEditorHint') },
                { value: 'viewer', label: t('family.roleViewer'), sublabel: t('family.roleViewerHint') },
              ]}
            />
            {invites.map((inv) => (
              <View key={inv.code} style={styles.code}>
                <View style={{ flex: 1 }}>
                  <AppText variant="tiny" color={colors.marigoldInk}>
                    {t('family.codeLabel', { role: roleLabel[inv.role] })}
                  </AppText>
                  <AppText style={styles.codeText} accessibilityLabel={inv.code.split('').join(' ')}>
                    {inv.code}
                  </AppText>
                  <AppText variant="caption" color={colors.inkMuted}>
                    {t('family.expires', {
                      when: formatShortDateTime(inv.expiresAt),
                    })}
                  </AppText>
                </View>
                <View style={{ gap: space.sm }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('family.share')} onPress={() => share(inv.code)} style={styles.codeBtn}>
                    <Feather name="share-2" size={20} color={colors.ink} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('family.cancelInvite')} onPress={() => cancelInvite(inv.code)} style={styles.codeBtn}>
                    <Feather name="x" size={20} color={colors.inkMuted} />
                  </Pressable>
                </View>
              </View>
            ))}
            <Button label={t('family.makeCode')} icon="key" size="medium" busy={making} onPress={makeInvite} />
          </Card>
        ) : null}

        {detail ? (
          <View style={{ gap: space.sm }}>
            <AppText variant="rowTitle" accessibilityRole="header">
              {t('family.members')}
            </AppText>
            <ListGroup>
              {detail.members.map((m, i) => {
                const self = m.userId === me?.id;
                const actionable = isOwner && m.role !== 'owner';
                const tone = roleTone[m.role];
                return (
                  <View key={m.userId}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable
                      accessibilityRole={actionable ? 'button' : undefined}
                      accessibilityLabel={`${m.name}${self ? ` ${t('family.you')}` : ''}, ${roleLabel[m.role]}`}
                      disabled={!actionable}
                      onPress={() => openMember(m)}
                      style={({ pressed }) => [styles.member, pressed && { backgroundColor: colors.ground }]}
                    >
                      <Avatar name={m.name} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText variant="bodyStrong" weight="bold" numberOfLines={1}>
                          {m.name} {self ? t('family.you') : ''}
                        </AppText>
                        <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
                          {m.email}
                        </AppText>
                      </View>
                      <View style={[styles.rolePill, { backgroundColor: tone.bg }]}>
                        <AppText variant="tiny" color={tone.fg} style={{ fontSize: 13 }}>
                          {roleLabel[m.role]}
                        </AppText>
                      </View>
                      {/* Same width either way, so every pill lines up. */}
                      <View style={styles.chevron}>
                        {actionable ? <Feather name="chevron-right" size={20} color={colors.inkMuted} /> : null}
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </ListGroup>
            {isOwner && detail.members.length > 1 ? (
              <AppText variant="caption" color={colors.inkMuted} style={{ paddingHorizontal: space.sm }}>
                {t('family.membersHint')}
              </AppText>
            ) : null}
          </View>
        ) : null}

        {family.role === 'viewer' ? (
          <AppText variant="meta" color={colors.inkMuted}>
            {t('family.viewerNote')}
          </AppText>
        ) : null}

        <Card style={{ gap: 6 }}>
          <AppText variant="label" color={colors.inkMuted}>
            {t('family.whoCanDoWhat')}
          </AppText>
          <AppText variant="meta">{t('family.ownerCan')}</AppText>
          <AppText variant="meta">{t('family.editorCan')}</AppText>
          <AppText variant="meta">{t('family.viewerCan')}</AppText>
        </Card>

        {detail && !isOwner ? <Button label={t('family.leave')} variant="danger" size="medium" onPress={leave} /> : null}

        {detail && isOwner ? (
          <View style={{ gap: space.sm }}>
            <ListGroup>
              <ListRow icon="edit-2" label={t('family.rename')} onPress={() => router.push('/family/rename')} />
              <Divider />
              <ListRow icon="user-check" label={t('family.handOver')} onPress={() => router.push('/family/hand-over')} />
              <Divider />
              <ListRow icon="trash-2" label={t('family.deleteLedger')} onPress={() => router.push('/family/delete')} danger />
            </ListGroup>
            <AppText variant="caption" color={colors.inkMuted} style={{ paddingHorizontal: space.sm }}>
              {t('family.ownerHint')}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.marigoldTint, borderColor: colors.marigoldTint },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9A15A',
    backgroundColor: '#FEF9EE',
    padding: space.md,
  },
  codeText: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 38, letterSpacing: 5, color: colors.ink },
  codeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  member: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 14, paddingVertical: space.md, minHeight: 64 },
  rolePill: { height: 28, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.pill },
  chevron: { width: 20, marginLeft: -space.xs, alignItems: 'center' },
});
