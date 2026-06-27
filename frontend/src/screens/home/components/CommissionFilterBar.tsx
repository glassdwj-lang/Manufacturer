/**
 * Horizontal filter strip rendered above the commission list.
 *
 * Shows a funnel toggle, the active filter count badge, and one
 * pill per applied filter (each with its own ✕ to clear it).
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { User } from "@/src/api/client";
import { useI18n } from "@/src/i18n";
import { AppliedFilters, FilterKey } from "../types";
import { ActiveChip } from "./ActiveChip";
import { homeStyles } from "../styles";

function labelForUser(list: User[], id: string, fallback: string): string {
  if (!id) return fallback;
  const hit = list.find((u) => u.id === id);
  if (!hit) return fallback;
  return hit.alias || hit.name || hit.email;
}

function formatDateRangeChip(from: string, to: string): string {
  const fmt = (iso: string): string => {
    if (!iso) return "";
    try {
      const [y, m, d] = iso.split("-").map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      return dt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: new Date().getFullYear() === y ? undefined : "numeric",
      });
    } catch {
      return iso;
    }
  };
  if (from && to) return `${fmt(from)} → ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  return `Until ${fmt(to)}`;
}

export function CommissionFilterBar({
  applied,
  activeCount,
  filtersOpen,
  onToggleOpen,
  onClearOne,
  onClearAll,
  clientOptions,
  mfgOptions,
  assocOptions,
}: {
  applied: AppliedFilters;
  activeCount: number;
  filtersOpen: boolean;
  onToggleOpen: () => void;
  onClearOne: (key: FilterKey) => void;
  onClearAll: () => void;
  clientOptions: User[];
  mfgOptions: User[];
  assocOptions: User[];
}) {
  const { t } = useI18n();
  return (
    <View style={homeStyles.filterBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={homeStyles.filterBarRow}
      >
        <TouchableOpacity
          testID="toggle-commission-filters"
          onPress={onToggleOpen}
          style={homeStyles.filterToggle}
        >
          <Ionicons
            name={filtersOpen ? "funnel" : "funnel-outline"}
            size={14}
            color={activeCount > 0 ? theme.primary : theme.textMuted}
          />
          <Text
            style={[
              homeStyles.filterToggleText,
              activeCount > 0 && { color: theme.primary },
            ]}
          >
            {t("home.filters.label")}
          </Text>
          {activeCount > 0 && (
            <View style={homeStyles.filterCount}>
              <Text style={homeStyles.filterCountText}>{activeCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {applied.q ? (
          <ActiveChip
            testID="active-chip-query"
            icon="search"
            label={`"${applied.q}"`}
            onClear={() => onClearOne("q")}
          />
        ) : null}
        {(applied.from || applied.to) && (
          <ActiveChip
            testID="active-chip-date"
            icon="calendar-outline"
            label={formatDateRangeChip(applied.from, applied.to)}
            onClear={() => {
              onClearOne("from");
              onClearOne("to");
            }}
          />
        )}
        {applied.mfg ? (
          <ActiveChip
            testID="active-chip-mfg"
            icon="business-outline"
            label={labelForUser(mfgOptions, applied.mfg, "Workshop")}
            onClear={() => onClearOne("mfg")}
          />
        ) : null}
        {applied.assoc ? (
          <ActiveChip
            testID="active-chip-assoc"
            icon="person-circle-outline"
            label={labelForUser(assocOptions, applied.assoc, "Associate")}
            onClear={() => onClearOne("assoc")}
          />
        ) : null}
        {applied.client ? (
          <ActiveChip
            testID="active-chip-client"
            icon="person-outline"
            label={labelForUser(clientOptions, applied.client, "Client")}
            onClear={() => onClearOne("client")}
          />
        ) : null}

        {activeCount > 0 && (
          <TouchableOpacity
            testID="clear-commission-filters"
            onPress={onClearAll}
            style={homeStyles.filterClear}
          >
            <Text style={homeStyles.filterClearText}>CLEAR ALL</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

export default CommissionFilterBar;
