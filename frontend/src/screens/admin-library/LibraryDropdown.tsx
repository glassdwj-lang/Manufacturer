/**
 * LibraryDropdown
 *
 * Compact tap-to-open selector used by the cross-order library shell to
 * pick a workshop / studio / client. Tapping the touchable opens a modal
 * sheet with a searchable list of options + a "clear / show all" row at
 * the top.
 *
 * Designed to fit two side-by-side on a 390-pt screen — each instance
 * takes 50% of the row width.
 */
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme, spacing } from "@/src/theme";

export type DropdownOption = {
  id: string;
  label: string;
  sublabel?: string;
};

export function LibraryDropdown({
  testID,
  icon,
  placeholder,
  allLabel,
  options,
  selectedId,
  onChange,
  searchPlaceholder = "Search\u2026",
}: {
  testID?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  allLabel: string;
  options: DropdownOption[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = options.find((o) => o.id === selectedId);
  const display = selected ? selected.label : placeholder;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) ||
        (o.sublabel || "").toLowerCase().includes(needle),
    );
  }, [q, options]);

  return (
    <>
      <TouchableOpacity
        testID={testID}
        style={[styles.toggle, !!selected && styles.toggleActive]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={14}
            color={selected ? theme.primary : theme.textMuted}
          />
        )}
        <Text
          style={[styles.toggleText, !!selected && styles.toggleTextActive]}
          numberOfLines={1}
        >
          {display}
        </Text>
        <Ionicons name="chevron-down" size={14} color={theme.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          testID={testID ? `${testID}-backdrop` : undefined}
        >
          <Pressable
            style={styles.sheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{placeholder.toUpperCase()}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={14} color={theme.textMuted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={searchPlaceholder}
                placeholderTextColor={theme.textMuted}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {q.length > 0 && (
                <TouchableOpacity onPress={() => setQ("")}>
                  <Ionicons
                    name="close-circle"
                    size={14}
                    color={theme.textMuted}
                  />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.id}
              ListHeaderComponent={
                <TouchableOpacity
                  testID={testID ? `${testID}-option-all` : undefined}
                  style={[
                    styles.optionRow,
                    selectedId == null && styles.optionRowSel,
                  ]}
                  onPress={() => {
                    onChange(null);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      selectedId == null && styles.optionLabelSel,
                    ]}
                  >
                    {allLabel}
                  </Text>
                  {selectedId == null && (
                    <Ionicons name="checkmark" size={16} color={theme.primary} />
                  )}
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const sel = item.id === selectedId;
                return (
                  <TouchableOpacity
                    testID={testID ? `${testID}-option-${item.id}` : undefined}
                    style={[styles.optionRow, sel && styles.optionRowSel]}
                    onPress={() => {
                      onChange(item.id);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.optionLabel,
                          sel && styles.optionLabelSel,
                        ]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                      {!!item.sublabel && (
                        <Text style={styles.optionSub} numberOfLines={1}>
                          {item.sublabel}
                        </Text>
                      )}
                    </View>
                    {sel && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={theme.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No matches.</Text>
                </View>
              }
              keyboardShouldPersistTaps="handled"
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 38,
  },
  toggleActive: { borderColor: theme.primary },
  toggleText: {
    flex: 1,
    color: theme.textSecondary,
    fontSize: 11,
    letterSpacing: 1,
  },
  toggleTextActive: { color: theme.primary },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.bg,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderColor: theme.border,
    maxHeight: "80%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sheetTitle: {
    color: theme.primary,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  searchInput: {
    flex: 1,
    color: theme.textPrimary,
    fontSize: 13,
    paddingVertical: 0,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
    gap: spacing.sm,
  },
  optionRowSel: { backgroundColor: "rgba(218,165,32,0.08)" },
  optionLabel: { color: theme.textPrimary, fontSize: 13 },
  optionLabelSel: { color: theme.primary, fontWeight: "600" },
  optionSub: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { color: theme.textMuted, fontSize: 12 },
});

export default LibraryDropdown;
