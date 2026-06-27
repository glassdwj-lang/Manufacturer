/**
 * Associate ownership selector. Shown only when role === "client" and at
 * least one associate exists in the system.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import type { User } from "@/src/api/client";
import { createUserStyles as styles } from "../styles";

export function AssociatePicker({
  options,
  selected,
  onSelect,
}: {
  options: User[];
  selected: User | null;
  onSelect: (u: User) => void;
}) {
  if (options.length === 0) return null;
  return (
    <>
      <Text style={styles.formLabel}>ASSIGNED ASSOCIATE</Text>
      <View style={styles.selectorBox}>
        {options.map((a) => {
          const isSel = selected?.id === a.id;
          return (
            <TouchableOpacity
              key={a.id}
              testID={`assoc-${a.id}`}
              onPress={() => onSelect(a)}
              style={[styles.selectorRow, isSel && styles.selectorRowSel]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.selectorName,
                    isSel && { color: theme.primary },
                  ]}
                >
                  {a.name}
                </Text>
                <Text style={styles.selectorEmail}>{a.email}</Text>
              </View>
              {isSel && (
                <Ionicons name="checkmark" size={18} color={theme.primary} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

export default AssociatePicker;
