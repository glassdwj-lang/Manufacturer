import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { useI18n } from "@/src/i18n";

const OPTIONS: { code: string; label: string; native: string }[] = [
  { code: "en", label: "English", native: "EN" },
  { code: "zh", label: "中文", native: "ZH" },
  { code: "fr", label: "Français", native: "FR" },
  { code: "it", label: "Italiano", native: "IT" },
];

/**
 * Header globe icon that opens a small modal letting the signed-in user pick
 * their manual display language. The picked language is stored on the server
 * via `PUT /api/users/me/language` (Q4=A) so it follows them across devices,
 * and we refresh the in-memory user so screens re-render with the new pack.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { user, setLanguage } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const current = user?.preferred_language || user?.language || "en";
  const currentLabel =
    OPTIONS.find((o) => o.code === current)?.native ?? current.toUpperCase();

  const pick = async (code: string) => {
    setBusy(code);
    try {
      await setLanguage(code);
      setOpen(false);
    } catch (e) {
      console.warn("language pick", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <TouchableOpacity
        testID="lang-switcher-button"
        onPress={() => setOpen(true)}
        style={[styles.btn, compact && styles.btnCompact]}
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
      >
        <Ionicons name="language-outline" size={16} color={theme.primary} />
        <Text style={styles.code}>{currentLabel}</Text>
      </TouchableOpacity>
      <Modal
        transparent
        animationType="fade"
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.eyebrow}>{t("lang.eyebrow")}</Text>
            <Text style={styles.title}>{t("lang.title")}</Text>
            <Text style={styles.sub}>
              {t("lang.sub")}
            </Text>
            {OPTIONS.map((o) => {
              const isCurrent = current === o.code;
              return (
                <TouchableOpacity
                  key={o.code}
                  testID={`lang-option-${o.code}`}
                  onPress={() => pick(o.code)}
                  disabled={!!busy}
                  style={[styles.row, isCurrent && styles.rowSel]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.rowLabel,
                        isCurrent && { color: theme.primary },
                      ]}
                    >
                      {o.label}
                    </Text>
                    <Text style={styles.rowCode}>{o.native}</Text>
                  </View>
                  {busy === o.code ? (
                    <ActivityIndicator color={theme.primary} />
                  ) : isCurrent ? (
                    <Ionicons name="checkmark" size={18} color={theme.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  btnCompact: { paddingHorizontal: 6, paddingVertical: 4 },
  code: { color: theme.primary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.lg,
  },
  eyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  title: { color: theme.textPrimary, fontSize: 18, marginTop: 4 },
  sub: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  rowSel: {},
  rowLabel: { color: theme.textPrimary, fontSize: 15 },
  rowCode: { color: theme.textMuted, fontSize: 11, letterSpacing: 1, marginTop: 2 },
});
