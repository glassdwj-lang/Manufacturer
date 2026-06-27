/**
 * Tiny pill rendered in the filter bar for each active filter. Shows an
 * icon + label and an inline ✕ that removes only that filter.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { homeStyles } from "../styles";

export function ActiveChip({
  testID,
  icon,
  label,
  onClear,
}: {
  testID?: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onClear: () => void;
}) {
  return (
    <View style={homeStyles.activeChip} testID={testID}>
      <Ionicons name={icon} size={12} color={theme.primary} />
      <Text style={homeStyles.activeChipText} numberOfLines={1}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={onClear}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        testID={testID ? `${testID}-clear` : undefined}
      >
        <Ionicons name="close" size={14} color={theme.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export default ActiveChip;
