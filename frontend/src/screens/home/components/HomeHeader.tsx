/**
 * Top-of-screen branding + role badge + language switcher + logout.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme, ROLE_LABELS } from "@/src/theme";
import { BrandStrip } from "@/src/components/BrandStrip";
import { LanguageSwitcher } from "@/src/components/LanguageSwitcher";
import { NotificationBell } from "@/src/components/NotificationBell";
import { useI18n } from "@/src/i18n";
import { homeStyles } from "../styles";

const ROLE_KEY: Record<
  string,
  "role.admin" | "role.manufacturer" | "role.associate" | "role.client"
> = {
  admin: "role.admin",
  manufacturer: "role.manufacturer",
  associate: "role.associate",
  client: "role.client",
};

export function HomeHeader({
  role,
  name,
  onLogout,
}: {
  role: string;
  name: string;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const roleLabel = ROLE_KEY[role]
    ? t(ROLE_KEY[role])
    : ROLE_LABELS[role] ?? role;
  return (
    <>
      <BrandStrip size={32} />
      <View style={homeStyles.headerTop}>
        <View style={homeStyles.brandText}>
          <Text style={homeStyles.brandMark}>{t("home.brand_mark")}</Text>
          <Text style={homeStyles.welcome}>
            {roleLabel} · {name}
          </Text>
        </View>
        <View style={homeStyles.headerActions}>
          <NotificationBell color={theme.primary} />
          <LanguageSwitcher />
          <TouchableOpacity
            testID="logout-button"
            onPress={onLogout}
            style={homeStyles.iconBtn}
          >
            <Ionicons name="log-out-outline" size={22} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

export default HomeHeader;
