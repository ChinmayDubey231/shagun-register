import { Feather } from "@expo/vector-icons";
import { DEMO_ACCOUNTS } from "@shagun/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card, Divider, ListGroup } from "@/components/layout";
import { Avatar } from "@/components/ledger";
import {
  Enter,
  InkReveal,
  IntroProvider,
  ShagunCoin,
  Toran,
} from "@/components/SignInIntro";
import { apiErrorMessage } from "@/i18n";
import { signInDev, signInWithGoogle } from "@/lib/account";
import { DEV_LOGIN, googleSignInAvailable } from "@/lib/googleSignIn";
import { chooseLanguage } from "@/lib/language";
import { colors, fonts, space } from "@/theme";

const FEATURES = [
  {
    icon: "wifi-off",
    key: "signIn.f1",
    bg: colors.marigoldTint,
    fg: colors.marigoldInk,
  },
  {
    icon: "users",
    key: "signIn.f2",
    bg: colors.sindoorTint,
    fg: colors.sindoor,
  },
  {
    icon: "repeat",
    key: "signIn.f3",
    bg: colors.receivedTint,
    fg: colors.received,
  },
] as const;

/** Google sign-in. After this the app works offline; tokens are kept in the phone's keystore. */
export default function SignInScreen() {
  const { t, i18n } = useTranslation();
  // "google", "dev" or the email of the demo account being signed in.
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devName, setDevName] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const roleLabel = {
    owner: t("family.roleOwner"),
    editor: t("family.roleEditor"),
    viewer: t("family.roleViewer"),
  };

  const run = async (which: string, fn: () => Promise<unknown>) => {
    setBusy(which);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <IntroProvider>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Toran />
            <View
              style={styles.markBox}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <Enter kind="pop" delay={250} style={styles.mark}>
                <AppText
                  style={{
                    fontFamily: fonts.wordmark,
                    fontSize: 40,
                    lineHeight: 56,
                  }}
                  color={colors.surface}
                >
                  श
                </AppText>
              </Enter>
              <ShagunCoin />
            </View>
            <View>
              <Enter delay={650}>
                <AppText
                  variant="title"
                  style={{ fontSize: 34, lineHeight: 42 }}
                  accessibilityRole="header"
                >
                  Shagun Register
                </AppText>
              </Enter>
              <InkReveal delay={760}>
                <AppText
                  style={{
                    fontFamily: fonts.wordmark,
                    fontSize: 22,
                    lineHeight: 32,
                  }}
                  color={colors.sindoor}
                >
                  शगुन रजिस्टर
                </AppText>
              </InkReveal>
            </View>
            <Enter delay={880}>
              <AppText
                variant="body"
                color={colors.inkMuted}
                style={{ fontSize: 18, lineHeight: 27 }}
              >
                {t("signIn.tagline")}
              </AppText>
            </Enter>

            <View style={styles.features}>
              {FEATURES.map((f, i) => (
                <Enter key={f.key} delay={980 + i * 80} style={styles.feature}>
                  <Enter
                    kind="pop"
                    delay={1040 + i * 80}
                    style={[styles.featureIcon, { backgroundColor: f.bg }]}
                  >
                    <Feather name={f.icon} size={22} color={f.fg} />
                  </Enter>
                  <AppText
                    variant="bodyStrong"
                    weight="medium"
                    style={{ flex: 1 }}
                  >
                    {t(f.key)}
                  </AppText>
                </Enter>
              ))}
            </View>

            <View style={{ flex: 1, minHeight: space.xl }} />

            {error ? (
              <AppText
                variant="meta"
                color={colors.danger}
                align="center"
                accessibilityLiveRegion="polite"
              >
                {error}
              </AppText>
            ) : null}

            <Enter delay={1250} style={{ gap: 14 }}>
              {googleSignInAvailable ? (
                <Button
                  label={t("signIn.google")}
                  icon="user"
                  busy={busy === "google"}
                  disabled={!!busy}
                  onPress={() => run("google", signInWithGoogle)}
                />
              ) : !DEV_LOGIN ? (
                <AppText variant="meta" color={colors.inkMuted} align="center">
                  {t("signIn.googleMissing")}
                </AppText>
              ) : null}

              {DEV_LOGIN ? (
                <Card style={{ gap: space.md }}>
                  <View>
                    <AppText variant="rowTitle">{t("signIn.devTitle")}</AppText>
                    <AppText variant="caption" color={colors.inkMuted}>
                      {t("signIn.devHint")}
                    </AppText>
                  </View>
                  <View style={{ gap: space.sm }}>
                    <AppText variant="label" color={colors.inkMuted}>
                      {t("signIn.demoTitle")}
                    </AppText>
                    <ListGroup>
                      {DEMO_ACCOUNTS.map((a, i) => {
                        const role = a.role
                          ? roleLabel[a.role]
                          : t("signIn.demoNoLedger");
                        return (
                          <View key={a.email}>
                            {i > 0 ? <Divider /> : null}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${a.name}, ${role}`}
                              accessibilityState={{
                                disabled: !!busy,
                                busy: busy === a.email,
                              }}
                              disabled={!!busy}
                              onPress={() =>
                                run(a.email, () => signInDev(a.email, a.name))
                              }
                              style={({ pressed }) => [
                                styles.demoRow,
                                pressed && { backgroundColor: colors.ground },
                              ]}
                            >
                              <Avatar name={a.name} size={36} />
                              <View style={{ flex: 1 }}>
                                <AppText variant="bodyStrong" weight="bold">
                                  {a.name}
                                </AppText>
                                <AppText
                                  variant="caption"
                                  color={colors.inkMuted}
                                >
                                  {role}
                                </AppText>
                              </View>
                              {busy === a.email ? (
                                <ActivityIndicator color={colors.sindoor} />
                              ) : (
                                <Feather
                                  name="chevron-right"
                                  size={20}
                                  color={colors.inkMuted}
                                />
                              )}
                            </Pressable>
                          </View>
                        );
                      })}
                    </ListGroup>
                    <AppText variant="caption" color={colors.inkMuted}>
                      {t("signIn.demoHint")}
                    </AppText>
                  </View>
                  <AppText variant="label" color={colors.inkMuted}>
                    {t("signIn.devOther")}
                  </AppText>
                  <Field
                    label={t("signIn.devName")}
                    value={devName}
                    onChangeText={setDevName}
                    autoCapitalize="words"
                  />
                  <Field
                    label={t("signIn.devEmail")}
                    value={devEmail}
                    onChangeText={setDevEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <Button
                    label={t("signIn.devButton")}
                    variant="secondary"
                    busy={busy === "dev"}
                    disabled={!!busy || !devEmail.trim() || !devName.trim()}
                    onPress={() =>
                      run("dev", () =>
                        signInDev(devEmail.trim(), devName.trim()),
                      )
                    }
                  />
                </Card>
              ) : null}
            </Enter>

            <Enter kind="fade" delay={1350}>
              <AppText
                variant="caption"
                color={colors.inkSubtle}
                align="center"
              >
                {t("signIn.needsInternet")} {t("signIn.contactsNote")}
              </AppText>
              {/* Written in the other language, so it can be read by whoever needs it. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("signIn.switchLanguage")}
                hitSlop={8}
                onPress={() =>
                  void chooseLanguage(i18n.language === "hi" ? "en" : "hi")
                }
                style={({ pressed }) => [
                  styles.language,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Feather name="globe" size={16} color={colors.sindoor} />
                <AppText variant="meta" weight="bold" color={colors.sindoor}>
                  {t("signIn.switchLanguage")}
                </AppText>
              </Pressable>
            </Enter>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </IntroProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: space.xxl, paddingTop: 44, gap: 14 },
  markBox: { width: 64, height: 64 },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.sindoor,
    alignItems: "center",
    justifyContent: "center",
  },
  language: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    minHeight: 44,
    paddingHorizontal: space.md,
  },
  demoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  features: { gap: 14, marginTop: space.md },
  feature: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
