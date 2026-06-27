/**
 * DateRangePresets
 *
 * Daily-Report-style horizontal tab bar with four presets:
 *   - DAY    → today only
 *   - WEEK   → last 7 days (rolling)
 *   - MONTH  → last 30 days (rolling)
 *   - CUSTOM → opens an inline from/to date picker pair
 *
 * Emits an `{ date_from, date_to }` ISO date pair via `onChange`. Both
 * are inclusive YYYY-MM-DD strings; when no preset is active both fields
 * are empty (= no date filter applied).
 */
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme, spacing } from "@/src/theme";
import { CalendarPicker } from "./CalendarPicker";

export type DateRangePreset =
  | "all"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "ytd"
  | "custom";

export type DateRangeValue = {
  preset: DateRangePreset;
  date_from: string;
  date_to: string;
};

export const EMPTY_DATE_RANGE: DateRangeValue = {
  preset: "all",
  date_from: "",
  date_to: "",
};

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Computes from/to ISO dates for a preset. CUSTOM keeps whatever the
 *  user already typed; everything else recomputes from today. */
export function rangeForPreset(
  preset: DateRangePreset,
  fallback?: DateRangeValue,
): DateRangeValue {
  if (preset === "custom") {
    return {
      preset: "custom",
      date_from: fallback?.date_from || "",
      date_to: fallback?.date_to || "",
    };
  }
  if (preset === "all") return { ...EMPTY_DATE_RANGE };
  const today = new Date();
  if (preset === "day") {
    const s = iso(today);
    return { preset, date_from: s, date_to: s };
  }
  if (preset === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { preset, date_from: iso(from), date_to: iso(today) };
  }
  if (preset === "quarter") {
    // Current calendar quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec).
    const qStartMonth = Math.floor(today.getMonth() / 3) * 3;
    const from = new Date(today.getFullYear(), qStartMonth, 1);
    return { preset, date_from: iso(from), date_to: iso(today) };
  }
  if (preset === "ytd") {
    // 1 January of the current year through today, inclusive.
    const from = new Date(today.getFullYear(), 0, 1);
    return { preset, date_from: iso(from), date_to: iso(today) };
  }
  // month → last 30 days
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { preset, date_from: iso(from), date_to: iso(today) };
}

const MONTHS_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jun 27" — short date suitable for the per-tab caption. */
function shortDate(d: Date): string {
  return `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}`;
}

/** Compact caption showing what calendar period each preset would cover
 *  if tapped *right now*. Updates per render so opening the screen on a
 *  new day immediately reflects the new ranges. */
function captionFor(
  preset: "day" | "week" | "month" | "quarter" | "ytd" | "custom",
  current: DateRangeValue,
): string {
  if (preset === "custom") {
    if (!current.date_from && !current.date_to) return "Pick…";
    const fmt = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      if (!y || !m || !d) return s;
      return `${MONTHS_ABBR[m - 1]} ${d}`;
    };
    if (current.date_from && current.date_to)
      return `${fmt(current.date_from)}–${fmt(current.date_to)}`;
    if (current.date_from) return `from ${fmt(current.date_from)}`;
    return `until ${fmt(current.date_to)}`;
  }
  const today = new Date();
  if (preset === "day") return shortDate(today);
  if (preset === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return `${shortDate(from)}–${today.getDate()}`;
  }
  if (preset === "month") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return `${shortDate(from)}–${shortDate(today)}`;
  }
  if (preset === "quarter") {
    const qStartMonth = Math.floor(today.getMonth() / 3) * 3;
    const from = new Date(today.getFullYear(), qStartMonth, 1);
    return `${shortDate(from)}–${shortDate(today)}`;
  }
  // ytd
  return `Jan 1–${shortDate(today)}`;
}

export function DateRangePresets({
  testID,
  value,
  onChange,
  labels,
}: {
  testID?: string;
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** Optional copy overrides for i18n. */
  labels?: Partial<
    Record<
      | "day"
      | "week"
      | "month"
      | "quarter"
      | "ytd"
      | "custom"
      | "daily_report",
      string
    >
  >;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const tab = (
    key: "day" | "week" | "month" | "quarter" | "ytd" | "custom",
    label: string,
  ) => {
    const active = value.preset === key;
    const caption = captionFor(key, value);
    return (
      <TouchableOpacity
        key={key}
        testID={testID ? `${testID}-${key}` : undefined}
        onPress={() => {
          if (key === "custom") {
            // CUSTOM tab always opens the calendar modal — tapping again
            // while active reopens (vs clearing) so the user can refine.
            setCalendarOpen(true);
            return;
          }
          if (active) {
            // Tap an active preset again → clear it.
            onChange(EMPTY_DATE_RANGE);
            return;
          }
          onChange(rangeForPreset(key));
        }}
        style={[styles.tab, active && styles.tabActive]}
      >
        <Text style={[styles.tabText, active && styles.tabTextActive]}>
          {label}
        </Text>
        <Text
          style={[styles.tabCaption, active && styles.tabCaptionActive]}
          numberOfLines={1}
        >
          {caption}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.tabsRow}>
        <Text style={styles.eyebrow}>
          {labels?.daily_report || "DAILY REPORT"}
        </Text>
        <View style={styles.tabs}>
          {tab("day", labels?.day || "DAY")}
          {tab("week", labels?.week || "WEEK")}
          {tab("month", labels?.month || "MONTH")}
          {tab("quarter", labels?.quarter || "QTR")}
          {tab("ytd", labels?.ytd || "YTD")}
          {tab("custom", labels?.custom || "CUSTOM")}
        </View>
      </View>
      <CalendarPicker
        visible={calendarOpen}
        initialFrom={value.date_from}
        initialTo={value.date_to}
        onClose={() => setCalendarOpen(false)}
        onApply={(range) => {
          onChange({ preset: "custom", ...range });
          setCalendarOpen(false);
        }}
        testID={testID ? `${testID}-calendar` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  eyebrow: {
    color: theme.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    minWidth: 60,
  },
  tabs: {
    flexDirection: "row",
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: theme.border,
  },
  tabActive: { backgroundColor: theme.primary },
  tabText: {
    color: theme.textSecondary,
    fontSize: 8,
    letterSpacing: 1.2,
    fontWeight: "600",
  },
  tabTextActive: { color: "#0A0A0A", fontWeight: "700" },
  tabCaption: {
    color: theme.textMuted,
    fontSize: 7,
    letterSpacing: 0.3,
    marginTop: 2,
    textAlign: "center",
  },
  tabCaptionActive: { color: "#0A0A0A", opacity: 0.7 },
  customRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  fieldLabel: {
    color: theme.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
});

export default DateRangePresets;
