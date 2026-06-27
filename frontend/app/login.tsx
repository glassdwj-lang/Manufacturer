import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { HeaderLogo } from "@/src/components/HeaderLogo";
import { useI18n } from "@/src/i18n";

const LOGIN_BG =
  "https://images.pexels.com/photos/6263069/pexels-photo-6263069.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const DEMO_ACCOUNTS: { labelKey: any; email: string; password: string }[] = [
  { labelKey: "login.demo.atelier", email: "admin" + "@" + "somnio.co", password: "Admin" + "@" + "2026" },
  { labelKey: "login.demo.workshop", email: "mfg" + "@" + "somnio.co", password: "Mfg" + "@" + "2026" },
  { labelKey: "login.demo.associate", email: "associate" + "@" + "somnio.co", password: "Assoc" + "@" + "2026" },
  { labelKey: "login.demo.client", email: "client" + "@" + "somnio.co", password: "Client" + "@" + "2026" },
];

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (overrideEmail?: string, overridePassword?: string) => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(overrideEmail ?? email.trim(), overridePassword ?? password);
    } catch (e: any) {
      setError(e?.message ?? t("login.error.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <ImageBackground source={{ uri: LOGIN_BG }} style={StyleSheet.absoluteFill} resizeMode="cover">
        <LinearGradient
          colors={["rgba(10,10,10,0.55)", "rgba(10,10,10,0.92)", "#0A0A0A"]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandBlock}>
              <View style={{ alignItems: "center", marginBottom: spacing.sm }}>
                <HeaderLogo size={36} />
              </View>
              <Text style={styles.brandTitle}>{t("login.brand.title")}</Text>
              <Text style={styles.brandSub}>
                {t("login.brand.sub")}
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formLabel}>{t("login.label.email")}</Text>
              <TextInput
                testID="login-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder={t("login.placeholder.email")}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                style={styles.input}
              />
              <View style={{ height: spacing.lg }} />
              <Text style={styles.formLabel}>{t("login.label.password")}</Text>
              <TextInput
                testID="login-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                style={styles.input}
              />
              {error && (
                <Text testID="login-error" style={styles.errorText}>
                  {error}
                </Text>
              )}
              <TouchableOpacity
                testID="login-submit-button"
                disabled={submitting}
                onPress={() => handleLogin()}
                style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#0A0A0A" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t("login.cta.enter")}</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.demoBlock}>
              <Text style={styles.demoTitle}>{t("login.demo.title")}</Text>
              {DEMO_ACCOUNTS.map((acc) => (
                <TouchableOpacity
                  key={acc.email}
                  testID={`demo-login-${acc.email}`}
                  style={styles.demoPill}
                  onPress={() => {
                    setEmail(acc.email);
                    setPassword(acc.password);
                    handleLogin(acc.email, acc.password);
                  }}
                >
                  <Text style={styles.demoPillLabel}>{t(acc.labelKey)}</Text>
                  <Text style={styles.demoPillEmail}>{acc.email}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: "center" },
  brandBlock: { marginBottom: spacing.xl, marginTop: spacing.xl },
  eyebrow: {
    color: theme.primary,
    fontSize: 11,
    letterSpacing: 4,
    marginBottom: spacing.md,
  },
  brandTitle: {
    color: theme.textPrimary,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "300",
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  },
  brandSub: {
    color: theme.textSecondary,
    fontSize: 14,
    marginTop: spacing.md,
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: "rgba(26,26,26,0.85)",
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.lg,
  },
  formLabel: {
    color: theme.primary,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  input: {
    color: theme.textPrimary,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: theme.error,
    fontSize: 13,
    marginTop: spacing.md,
  },
  primaryBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  primaryBtnText: {
    color: "#0A0A0A",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 3,
  },
  demoBlock: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  demoTitle: {
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: spacing.md,
  },
  demoPill: {
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  demoPillLabel: { color: theme.textPrimary, fontSize: 13, fontWeight: "500" },
  demoPillEmail: { color: theme.primary, fontSize: 11, letterSpacing: 1 },
});
