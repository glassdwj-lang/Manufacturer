/**
 * Empty-list placeholder shown by the home FlatList when the commission
 * query returns no orders.
 */
import React from "react";
import { Text, View } from "react-native";
import { useI18n } from "@/src/i18n";
import { homeStyles } from "../styles";

export function HomeEmpty({ role }: { role: string }) {
  const { t } = useI18n();
  const isStaff = role === "admin" || role === "associate";
  return (
    <View style={homeStyles.empty}>
      <Text style={homeStyles.emptyTitle}>{t("home.empty.title")}</Text>
      <Text style={homeStyles.emptyText}>
        {isStaff ? t("home.empty.admin") : t("home.empty.viewer")}
      </Text>
    </View>
  );
}

export default HomeEmpty;
