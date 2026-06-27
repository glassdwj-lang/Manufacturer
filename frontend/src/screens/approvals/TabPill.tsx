/** Tab pill with optional count badge used by the approvals tab bar. */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { styles } from "./styles";

export function TabPill({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
      testID={`approvals-tab-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
      {count > 0 && (
        <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
          <Text
            style={[
              styles.tabBadgeText,
              active && styles.tabBadgeTextActive,
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
