/**
 * Inline single-select people picker reused for client / manufacturer /
 * associate filtering. Tightly coupled to the home filter panel's
 * "only one picker open at a time" state machine.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { User } from "@/src/api/client";
import { homeStyles } from "../styles";

export function PeoplePicker({
  label,
  placeholder,
  options,
  selectedId,
  isOpen,
  onToggle,
  onSelect,
  renderLabel,
  renderSub,
}: {
  label: string;
  placeholder: string;
  options: User[];
  selectedId: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  renderLabel: (u: User) => string;
  renderSub: (u: User) => string;
}) {
  const selected = options.find((u) => u.id === selectedId);
  return (
    <>
      <Text style={homeStyles.filterLabel}>{label}</Text>
      <TouchableOpacity
        style={homeStyles.pickerToggle}
        onPress={onToggle}
        testID={`picker-toggle-${label.toLowerCase().replace(/[^a-z]/g, "-")}`}
      >
        <Text
          style={[
            homeStyles.pickerToggleText,
            !selected && homeStyles.pickerToggleEmpty,
          ]}
        >
          {selected ? renderLabel(selected) : placeholder}
        </Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={14}
          color={theme.textMuted}
        />
      </TouchableOpacity>
      {isOpen && (
        <ScrollView style={homeStyles.pickerList} nestedScrollEnabled>
          <TouchableOpacity
            testID="picker-row-clear"
            style={homeStyles.pickerRow}
            onPress={() => onSelect("")}
          >
            <Text
              style={[
                homeStyles.pickerRowName,
                !selectedId && { color: theme.primary },
              ]}
            >
              {placeholder}
            </Text>
            {!selectedId && (
              <Ionicons
                name="checkmark"
                size={16}
                color={theme.primary}
                style={{ marginLeft: "auto" }}
              />
            )}
          </TouchableOpacity>
          {options.map((u) => {
            const sel = selectedId === u.id;
            return (
              <TouchableOpacity
                key={u.id}
                testID={`picker-row-${u.id}`}
                style={[homeStyles.pickerRow, sel && homeStyles.pickerRowSel]}
                onPress={() => onSelect(u.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      homeStyles.pickerRowName,
                      sel && { color: theme.primary },
                    ]}
                    numberOfLines={1}
                  >
                    {renderLabel(u)}
                  </Text>
                  <Text style={homeStyles.pickerRowSub} numberOfLines={1}>
                    {renderSub(u)}
                  </Text>
                </View>
                {sel && (
                  <Ionicons name="checkmark" size={16} color={theme.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

export default PeoplePicker;
