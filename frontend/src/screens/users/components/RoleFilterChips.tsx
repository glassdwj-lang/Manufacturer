/**
 * Horizontal role chip strip used at the top of the Users directory.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useI18n } from "@/src/i18n";
import { ROLE_FILTERS } from "../helpers";
import { usersStyles as styles } from "../styles";

export function RoleFilterChips({
  filter,
  onChange,
}: {
  filter: string;
  onChange: (key: string) => void;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.chipsWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {ROLE_FILTERS.map((f) => {
          const isSel = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              testID={`filter-chip-${f.key}`}
              onPress={() => onChange(f.key)}
              style={[styles.chip, isSel && styles.chipSel]}
            >
              <Text style={[styles.chipText, isSel && styles.chipTextSel]}>
                {t(f.labelKey as any)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default RoleFilterChips;
