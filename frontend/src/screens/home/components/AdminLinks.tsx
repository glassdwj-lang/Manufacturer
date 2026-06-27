/**
 * Admin & Associate quick-link rail shown above the commission list.
 *
 * Two flavours:
 *   - `AssociateLinks` — just the Media Approvals button.
 *   - `AdminLinks` — full panel: Dashboard, Approvals, CAD/Renders
 *     libraries, Users, Atelier Tools.
 *
 * Both surface the aggregated pending-approvals badge.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { homeStyles } from "../styles";

export function AssociateLinks({ approvalsCount }: { approvalsCount: number }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <View style={homeStyles.adminLinks}>
      <TouchableOpacity
        testID="approvals-button-assoc"
        style={homeStyles.linkBtn}
        onPress={() => router.push("/(app)/approvals")}
      >
        <Ionicons
          name="shield-checkmark-outline"
          size={16}
          color={theme.primary}
        />
        <Text style={homeStyles.linkBtnText}>
          {t("home.link.media_approvals")}
        </Text>
        {approvalsCount > 0 && (
          <View style={homeStyles.approvalsBadge}>
            <Text style={homeStyles.approvalsBadgeText}>{approvalsCount}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export function AdminLinks({ approvalsCount }: { approvalsCount: number }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <View style={homeStyles.adminLinks}>
      <TouchableOpacity
        testID="dashboard-button"
        style={homeStyles.linkBtn}
        onPress={() => router.push("/(app)/dashboard")}
      >
        <Ionicons name="stats-chart-outline" size={16} color={theme.primary} />
        <Text style={homeStyles.linkBtnText}>{t("home.link.dashboard")}</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        testID="approvals-button"
        style={[homeStyles.linkBtn, { marginTop: spacing.sm }]}
        onPress={() => router.push("/(app)/approvals")}
      >
        <Ionicons
          name="shield-checkmark-outline"
          size={16}
          color={theme.primary}
        />
        <Text style={homeStyles.linkBtnText}>
          {t("home.link.media_approvals")}
        </Text>
        {approvalsCount > 0 && (
          <View style={homeStyles.approvalsBadge}>
            <Text style={homeStyles.approvalsBadgeText}>{approvalsCount}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        testID="cad-library-button"
        style={[homeStyles.linkBtn, { marginTop: spacing.sm }]}
        onPress={() => router.push("/(app)/admin/cad-files")}
      >
        <Ionicons name="cube-outline" size={16} color={theme.primary} />
        <Text style={homeStyles.linkBtnText}>{t("home.link.cad_library")}</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        testID="renders-library-button"
        style={[homeStyles.linkBtn, { marginTop: spacing.sm }]}
        onPress={() => router.push("/(app)/admin/renders")}
      >
        <Ionicons name="images-outline" size={16} color={theme.primary} />
        <Text style={homeStyles.linkBtnText}>
          {t("home.link.renders_library")}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        testID="manage-users-button"
        style={[homeStyles.linkBtn, { marginTop: spacing.sm }]}
        onPress={() => router.push("/(app)/users")}
      >
        <Ionicons name="people-outline" size={16} color={theme.primary} />
        <Text style={homeStyles.linkBtnText}>{t("home.link.manage_users")}</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        testID="atelier-tools-button"
        style={[homeStyles.linkBtn, { marginTop: spacing.sm }]}
        onPress={() => router.push("/(app)/admin/atelier-tools")}
      >
        <Ionicons name="construct-outline" size={16} color={theme.primary} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={homeStyles.linkBtnText}>
            {t("home.link.atelier_tools")}
          </Text>
          <Text style={homeStyles.toolsSub}>
            {t("home.link.atelier_tools.sub")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
