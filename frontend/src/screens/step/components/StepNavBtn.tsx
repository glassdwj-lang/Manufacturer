/** Reusable PREV / NEXT chevron button for step navigation.
 *
 *  Looks like the secondary action pills in the StepReadOnlyView so the
 *  4-button mfgAmendRow line (PREV | UPDATE | REMOVE COMPLETE | NEXT)
 *  reads as a single cohesive control strip.
 */
import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { styles } from "../styles";

export function StepNavBtn({
  direction,
  disabled,
  onPress,
  testID,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const icon = direction === "prev" ? "chevron-back" : "chevron-forward";
  const label = direction === "prev" ? "PREVIOUS STEP" : "NEXT STEP";
  return (
    <TouchableOpacity
      testID={testID || `step-${direction}`}
      onPress={onPress}
      disabled={disabled}
      style={[styles.navPillBtn, disabled && styles.navPillBtnDim]}
      accessibilityLabel={direction === "prev" ? "Previous step" : "Next step"}
    >
      {direction === "prev" && (
        <Ionicons
          name={icon}
          size={14}
          color={disabled ? theme.textMuted : theme.primary}
        />
      )}
      <Text
        style={[styles.navPillText, disabled && { color: theme.textMuted }]}
      >
        {label}
      </Text>
      {direction === "next" && (
        <Ionicons
          name={icon}
          size={14}
          color={disabled ? theme.textMuted : theme.primary}
        />
      )}
    </TouchableOpacity>
  );
}
