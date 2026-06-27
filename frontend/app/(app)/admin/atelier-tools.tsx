/**
 * Admin · Atelier Tools
 * ---------------------
 * A dedicated sub-page that hosts the four secondary admin destinations
 * that used to clutter the home dashboard:
 *
 *   • Recycle Bin            — soft-deleted orders + media restore queue
 *   • Activity Log           — chronological audit trail
 *   • Test Translation       — Claude i18n sandbox
 *   • Atelier Debug          — seed/sample-data utilities (flag-gated)
 *
 * Each row mirrors the visual language of the home dashboard's link
 * buttons (golden chevron + icon + uppercase title) and respects the
 * `flags.enableDebug` toggle so the Debug entry stays hidden in
 * production builds.
 */
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";
import { useI18n } from "@/src/i18n";
import { flags } from "@/src/flags";

type ToolDef = {
  testID: string;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: any;
  subKey?: any;
  path: string;
  /** When provided and false, the row is hidden. */
  visible?: boolean;
};

export default function AtelierToolsScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { t } = useI18n();

  const tools: ToolDef[] = [
    {
      testID: "tool-recycle-bin",
      icon: "trash-bin-outline",
      titleKey: "home.link.recycle_bin",
      subKey: "tools.recycle_bin.sub",
      path: "/(app)/recycle-bin",
    },
    {
      testID: "tool-activity-log",
      icon: "document-text-outline",
      titleKey: "home.link.activity_log",
      subKey: "tools.activity_log.sub",
      path: "/(app)/activity-log",
    },
    {
      testID: "tool-test-translate",
      icon: "language-outline",
      titleKey: "home.link.test_translation",
      subKey: "tools.test_translate.sub",
      path: "/(app)/test-translate",
    },
    {
      testID: "tool-debug",
      icon: "construct-outline",
      titleKey: "home.link.debug",
      subKey: "tools.debug.sub",
      path: "/(app)/debug",
      visible: flags.enableDebug,
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={safeBack}
          testID="atelier-tools-back"
          style={{ padding: 4 }}
        >
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{t("tools.eyebrow")}</Text>
          <Text style={styles.title}>{t("home.link.atelier_tools")}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>{t("tools.intro")}</Text>
        {tools
          .filter((tool) => tool.visible !== false)
          .map((tool) => (
            <TouchableOpacity
              key={tool.testID}
              testID={tool.testID}
              style={styles.toolRow}
              onPress={() => router.push(tool.path as any)}
              activeOpacity={0.85}
            >
              <View style={styles.iconBubble}>
                <Ionicons name={tool.icon} size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolTitle}>{t(tool.titleKey)}</Text>
                {tool.subKey && (
                  <Text style={styles.toolSub}>{t(tool.subKey)}</Text>
                )}
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={theme.textMuted}
              />
            </TouchableOpacity>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: spacing.sm,
  },
  eyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  title: { color: theme.textPrimary, fontSize: 18, marginTop: 2 },
  body: { padding: spacing.lg, gap: spacing.md },
  intro: {
    color: theme.textMuted,
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    gap: spacing.md,
  },
  iconBubble: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  toolTitle: {
    color: theme.textPrimary,
    fontSize: 13,
    letterSpacing: 2,
  },
  toolSub: {
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 3,
    fontStyle: "italic",
    lineHeight: 14,
  },
});
