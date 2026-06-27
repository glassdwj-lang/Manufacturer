/**
 * Bulk-select header row — hint + toggle button. Shown to admins above
 * the commission list when there are orders to bulk-manage.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { homeStyles } from "../styles";

export function BulkSelectToggleRow({
  selectMode,
  selectedCount,
  onEnter,
  onExit,
}: {
  selectMode: boolean;
  selectedCount: number;
  onEnter: () => void;
  onExit: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={homeStyles.selectModeRow}>
      {selectMode ? (
        <Text style={homeStyles.selectModeHint}>
          {t("home.bulk.selected", { n: selectedCount })}
        </Text>
      ) : (
        <Text style={homeStyles.selectModeHint}>{t("home.bulk.hint")}</Text>
      )}
      <TouchableOpacity
        testID={selectMode ? "exit-select-mode" : "enter-select-mode"}
        onPress={() => (selectMode ? onExit() : onEnter())}
        style={homeStyles.selectToggle}
      >
        <Ionicons
          name={selectMode ? "close-outline" : "checkbox-outline"}
          size={14}
          color={theme.primary}
        />
        <Text style={homeStyles.selectToggleText}>
          {selectMode
            ? t("home.bulk.cancel_select")
            : t("home.bulk.select")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default BulkSelectToggleRow;
