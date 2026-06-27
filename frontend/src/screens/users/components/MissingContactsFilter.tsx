/**
 * Sub-filter chip surfaced only for Workshops and CAD/Render vendor tabs.
 * Toggles the "only show users missing a primary contact" gate, with a
 * little count badge for ambient discoverability.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { usersStyles as styles } from "../styles";

export function MissingContactsFilter({
  active,
  count,
  onToggle,
}: {
  active: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <View style={styles.subFilterRow}>
      <TouchableOpacity
        testID="filter-missing-contacts"
        onPress={onToggle}
        style={[styles.missingChip, active && styles.missingChipSel]}
      >
        <Ionicons
          name={active ? "alert-circle" : "alert-circle-outline"}
          size={14}
          color={active ? "#0A0A0A" : theme.primary}
        />
        <Text
          style={[
            styles.missingChipText,
            active && styles.missingChipTextSel,
          ]}
        >
          MISSING CONTACTS
        </Text>
        {count > 0 && (
          <View
            style={[styles.missingBadge, active && styles.missingBadgeSel]}
          >
            <Text
              style={[
                styles.missingBadgeText,
                active && styles.missingBadgeTextSel,
              ]}
            >
              {count}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      {active && (
        <Text style={styles.subFilterHint}>
          Showing workshops with no contact filled.
        </Text>
      )}
    </View>
  );
}

export default MissingContactsFilter;
