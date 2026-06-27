/**
 * State / Region field. When the active country provides a fixed list
 * of subdivisions, renders an inline dropdown; otherwise falls back to a
 * free-text input so the form still works for countries we don't have
 * structured data for.
 */
import React from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { StateEntry } from "../types";
import { createUserStyles as styles } from "../styles";

export function StatePicker({
  state,
  setState,
  stateLabel,
  options,
  selectedName,
  open,
  onToggle,
}: {
  state: string;
  setState: (v: string) => void;
  stateLabel: string;
  options: StateEntry[];
  selectedName: string;
  open: boolean;
  onToggle: () => void;
}) {
  const hasDropdown = options.length > 0;
  if (!hasDropdown) {
    return (
      <TextInput
        testID="user-state-input"
        value={state}
        onChangeText={setState}
        placeholder={`e.g. ${stateLabel}`}
        placeholderTextColor={theme.textMuted}
        style={styles.input}
      />
    );
  }
  return (
    <>
      <TouchableOpacity
        testID="state-toggle"
        style={[styles.input, styles.countrySelectRow]}
        onPress={onToggle}
      >
        <Text
          style={[
            styles.countrySelectText,
            !selectedName && { color: theme.textMuted },
          ]}
        >
          {selectedName || `Select a ${stateLabel.toLowerCase()}\u2026`}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.textMuted}
        />
      </TouchableOpacity>
      {open && (
        <View style={styles.selectorBox}>
          <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
            {options.map((s) => {
              const isSel = state === s.code || state === s.name;
              return (
                <TouchableOpacity
                  key={s.code}
                  testID={`state-${s.code}`}
                  onPress={() => {
                    setState(s.name);
                    onToggle();
                  }}
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
                      {s.name}
                    </Text>
                    <Text style={styles.selectorEmail}>{s.code}</Text>
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

export default StatePicker;
