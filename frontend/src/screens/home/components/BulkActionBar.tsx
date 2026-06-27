/**
 * Bottom bar surfaced when admin is in bulk-select mode. Pinned to the
 * bottom of the safe area; renders a cancel button and a destructive
 * "move to bin" CTA.
 */
import React from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/i18n";
import { homeStyles } from "../styles";

export function BulkActionBar({
  busy,
  selectedCount,
  onCancel,
  onDelete,
}: {
  busy: boolean;
  selectedCount: number;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={homeStyles.bulkBar} testID="bulk-action-bar">
      <TouchableOpacity
        testID="bulk-cancel"
        onPress={onCancel}
        style={homeStyles.bulkCancel}
        disabled={busy}
      >
        <Text style={homeStyles.bulkCancelText}>{t("common.cancel")}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="bulk-delete"
        onPress={onDelete}
        style={[
          homeStyles.bulkDelete,
          (busy || selectedCount === 0) && { opacity: 0.4 },
        ]}
        disabled={busy || selectedCount === 0}
      >
        {busy ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <>
            <Ionicons name="trash-outline" size={14} color="#0A0A0A" />
            <Text style={homeStyles.bulkDeleteText}>
              {t("home.bulk.move_to_bin", { n: selectedCount })}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default BulkActionBar;
