/**
 * Small reusable pill button used for APPROVE / HOLD / REJECT / REINSTATE
 * actions in the moderation queue. Supports outlined + filled variants and
 * a muted/disabled state used by the "must-inspect-first" rule.
 */
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { theme } from "@/src/theme";
import { styles } from "./styles";

export function ActionButton({
  label,
  color,
  filled,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  color: string;
  /** When true, paint the button with `color` and use white text. Used
   *  for destructive actions (e.g. REJECT) so they stand out from the
   *  outlined APPROVE / HOLD pills. */
  filled?: boolean;
  loading?: boolean;
  /** Locked-out state — used by the "must inspect first" rule. */
  disabled?: boolean;
  onPress: () => void;
}) {
  const muted = disabled && !loading;
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { borderColor: muted ? theme.divider : color },
        filled && {
          backgroundColor: muted ? theme.divider : color,
        },
        muted && { opacity: 0.55 },
      ]}
      onPress={onPress}
      disabled={loading || disabled}
      testID={`action-${label.toLowerCase()}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={filled ? "#FFFFFF" : color} />
      ) : (
        <Text
          style={[
            styles.actionBtnText,
            {
              color: muted
                ? theme.textMuted
                : filled
                  ? "#FFFFFF"
                  : color,
            },
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
