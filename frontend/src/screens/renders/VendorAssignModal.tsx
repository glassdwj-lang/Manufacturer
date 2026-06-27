/** Vendor (CAD-renderer) assignment modal opened from the renders
 *  screen. Lets the admin pick from the cad_renderer roster or unassign
 *  the current vendor. */
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { theme, spacing } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { styles } from "./styles";
import type { VendorBrief } from "./useRenders";

export function VendorAssignModal({
  visible,
  vendorId,
  vendorRoster,
  onClose,
  onPick,
}: {
  visible: boolean;
  vendorId: string | null;
  vendorRoster: VendorBrief[] | null;
  onClose: () => void;
  onPick: (newVendorId: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {t("renders.assign.modal_title")}
          </Text>
          <View style={{ width: 22 }} />
        </View>
        <FlatList
          data={vendorRoster || []}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: spacing.lg }}
          ListHeaderComponent={
            vendorId ? (
              <Pressable
                style={[styles.row, styles.unassignRow]}
                onPress={() => onPick(null)}
                testID="vendor-unassign"
              >
                <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                <Text style={[styles.name, { color: "#FF6B6B" }]}>
                  {t("renders.assign.unassign")}
                </Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            vendorRoster === null ? (
              <ActivityIndicator
                color={theme.primary}
                style={{ marginTop: spacing.xl }}
              />
            ) : (
              <Text style={styles.emptyText}>
                {t("renders.assign.empty_directory")}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, item.id === vendorId && styles.rowActive]}
              onPress={() => onPick(item.id)}
              testID={`vendor-pick-${item.id}`}
            >
              <Ionicons
                name={
                  item.id === vendorId
                    ? "checkmark-circle"
                    : "person-circle-outline"
                }
                size={20}
                color={
                  item.id === vendorId ? theme.primary : theme.textMuted
                }
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.email}</Text>
              </View>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
