/**
 * 3-up role selector chips. Disabled in edit mode (role is immutable
 * once a user exists).
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ROLE_LABELS } from "@/src/theme";
import type { Role } from "@/src/api/client";
import { ROLE_OPTIONS } from "../types";
import { createUserStyles as styles } from "../styles";

export function RoleChipRow({
  role,
  onChange,
  disabled,
}: {
  role: Role;
  onChange: (r: Role) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.roleRow}>
      {ROLE_OPTIONS.map((r) => {
        const isSel = role === r;
        return (
          <TouchableOpacity
            key={r}
            testID={`role-chip-${r}`}
            onPress={() => !disabled && onChange(r)}
            disabled={disabled}
            style={[
              styles.roleChip,
              isSel && styles.roleChipSel,
              disabled && !isSel && { opacity: 0.4 },
            ]}
          >
            <Text
              style={[
                styles.roleChipText,
                isSel && styles.roleChipTextSel,
              ]}
            >
              {ROLE_LABELS[r]?.toUpperCase() || r.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default RoleChipRow;
