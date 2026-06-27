/**
 * Country selector with a toggleable inline dropdown panel.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Country, DIAL_CODE_FALLBACK } from "../types";
import { createUserStyles as styles } from "../styles";

export function CountryPicker({
  countries,
  selectedCode,
  onSelect,
  open,
  onToggle,
}: {
  countries: Country[];
  selectedCode: string;
  onSelect: (code: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const selected = countries.find((c) => c.code === selectedCode);
  return (
    <>
      <TouchableOpacity
        testID="country-toggle"
        style={[styles.input, styles.countrySelectRow]}
        onPress={onToggle}
      >
        <Text style={styles.countrySelectText}>
          {selected?.name || "Select a country\u2026"}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.textMuted}
        />
      </TouchableOpacity>
      {open && (
        <View style={styles.selectorBox}>
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
            {countries.map((c) => {
              const isSel = selectedCode === c.code;
              return (
                <TouchableOpacity
                  key={c.code}
                  testID={`country-${c.code}`}
                  onPress={() => onSelect(c.code)}
                  style={[
                    styles.selectorRow,
                    isSel && styles.selectorRowSel,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.selectorName,
                        isSel && { color: theme.primary },
                      ]}
                    >
                      {c.name}
                    </Text>
                    <Text style={styles.selectorEmail}>
                      {c.language_name}
                      {c.dial_code
                        ? `  \u00b7  ${c.dial_code}`
                        : DIAL_CODE_FALLBACK[c.code]
                          ? `  \u00b7  ${DIAL_CODE_FALLBACK[c.code]}`
                          : ""}
                    </Text>
                  </View>
                  {isSel && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={theme.primary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </>
  );
}

export default CountryPicker;
