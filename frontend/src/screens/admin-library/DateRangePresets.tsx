/**
 * DateRangePresets
 *
 * Daily-Report-style horizontal tab bar with preset ranges:
 *   - DAY     → today only
 *   - WEEK    → last 7 days (rolling)
 *   - MONTH   → opens a chooser:
 *                  · This month (1st → today)
 *                  · Last 30 days (rolling)
 *   - QTR     → current calendar quarter
 *   - YTD     → 1 Jan → today
 *   - CUSTOM  → opens the parchment CalendarPicker
 *
 * Emits an `{ date_from, date_to }` ISO date pair via `onChange`. Both
 * are inclusive YYYY-MM-DD strings; when no preset is active both fields
 * are empty (= no date filter applied).
 */
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme, spacing } from "@/src/theme";
import { CalendarPicker } from "./CalendarPicker";

export type DateRangePreset =
  | "all"
  | "day"
  | "week"
  | "month"
  | "mtd"
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
  if (preset === "mtd") {
    // Month-to-date: 1st of current month through today, inclusive.
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { preset, date_from: iso(from), date_to: iso(today) };
  }
  // month → last 30 days (rolling)
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
    // Reflect whichever month flavour is *currently* active so the
    // caption matches the data the user is seeing.
    if (current.preset === "mtd") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return `${shortDate(from)}–${shortDate(today)}`;
    }
    // Default preview: last 30 days (matches the legacy "month" preset).
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

// ---------------------------------------------------------------------------
// MonthChooserModal — small parchment popover asking the user whether MONTH
// should mean "this month so far" or "last 30 days". Keeps the language
// identical across all 5 cross-order libraries.
// ---------------------------------------------------------------------------
function MonthChooserModal({
  visible,
  selected,
  onPick,
  onClose,
  testID,
}: {
  visible: boolean;
  /** Which option, if any, is currently active. */
  selected: "mtd" | "month" | null;
  onPick: (which: "mtd" | "month") => void;
  onClose: () => void;
  testID?: string;
}) {
  const today = new Date();
  const mtdFrom = new Date(today.getFullYear(), today.getMonth(), 1);
  const rolFrom = new Date(today);
  rolFrom.setDate(rolFrom.getDate() - 29);
  const fmt = (d: Date) =>
    `${d.getDate()} ${MONTHS_ABBR[d.getMonth()]} ${d.getFullYear()}`;

  const options: {
    key: "mtd" | "month";
    eyebrow: string;
    title: string;
    range: string;
  }[] = [
    {
      key: "mtd",
      eyebrow: "MONTH-TO-DATE",
      title: "This month so far",
      range: `${fmt(mtdFrom)} → ${fmt(today)}`,
    },
    {
      key: "month",
      eyebrow: "ROLLING WINDOW",
      title: "Last 30 days",
      range: `${fmt(rolFrom)} → ${fmt(today)}`,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={chooserStyles.backdrop}
        onPress={onClose}
        testID={testID ? `${testID}-month-chooser-backdrop` : undefined}
      >
        <Pressable
          style={chooserStyles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={chooserStyles.eyebrow}>MONTH · CHOOSE A WINDOW</Text>
          <Text style={chooserStyles.title}>Which Month?</Text>
          <View style={chooserStyles.rule} />
          <Text style={chooserStyles.subtitle}>
            Pick how you&apos;d like to read the month — calendar month so far,
            or a rolling 30-day window ending today.
          </Text>

          <View style={chooserStyles.optionList}>
            {options.map((opt) => {
              const active = selected === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  testID={
                    testID ? `${testID}-month-chooser-${opt.key}` : undefined
                  }
                  onPress={() => onPick(opt.key)}
                  activeOpacity={0.75}
                  style={[
                    chooserStyles.option,
                    active && chooserStyles.optionActive,
                  ]}
                >
                  <View style={chooserStyles.optionBody}>
                    <Text
                      style={[
                        chooserStyles.optEyebrow,
                        active && chooserStyles.optEyebrowActive,
                      ]}
                    >
                      {opt.eyebrow}
                    </Text>
                    <Text
                      style={[
                        chooserStyles.optTitle,
                        active && chooserStyles.optTitleActive,
                      ]}
                    >
                      {opt.title}
                    </Text>
                    <Text
                      style={[
                        chooserStyles.optRange,
                        active && chooserStyles.optRangeActive,
                      ]}
                    >
                      {opt.range}
                    </Text>
                  </View>
                  <View
                    style={[
                      chooserStyles.optTick,
                      active && chooserStyles.optTickActive,
                    ]}
                  >
                    {active && (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            testID={testID ? `${testID}-month-chooser-cancel` : undefined}
            onPress={onClose}
            style={chooserStyles.cancelBtn}
          >
            <Text style={chooserStyles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
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
  const [monthChooserOpen, setMonthChooserOpen] = useState(false);

  const tab = (
    key: "day" | "week" | "month" | "quarter" | "ytd" | "custom",
    label: string,
  ) => {
    // The MONTH tab is considered active whether the user picked the
    // calendar-month or the rolling-30 flavour.
    const active =
      key === "month"
        ? value.preset === "month" || value.preset === "mtd"
        : value.preset === key;
    const caption = captionFor(key, value);
    return (
      <TouchableOpacity
        key={key}
        testID={testID ? `${testID}-${key}` : undefined}
        onPress={() => {
          if (key === "custom") {
            // CUSTOM tab always opens the calendar modal.
            setCalendarOpen(true);
            return;
          }
          if (key === "month") {
            // MONTH always opens the chooser — even when active, so the
            // user can switch between the two flavours.
            setMonthChooserOpen(true);
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
      <MonthChooserModal
        visible={monthChooserOpen}
        selected={
          value.preset === "mtd"
            ? "mtd"
            : value.preset === "month"
              ? "month"
              : null
        }
        onPick={(which) => {
          onChange(rangeForPreset(which));
          setMonthChooserOpen(false);
        }}
        onClose={() => setMonthChooserOpen(false)}
        testID={testID}
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

// ---------------------------------------------------------------------------
// MonthChooserModal styles — parchment palette to match CalendarPicker so the
// two modals feel like siblings rather than ad-hoc surfaces.
// ---------------------------------------------------------------------------
const PARCHMENT = {
  bg: "#F4ECDD",
  surface: "#FAF5EA",
  border: "#E2D6BB",
  borderStrong: "#C7B58E",
  ink: "#1A1A1A",
  inkMuted: "#8A7E63",
  accent: "#A05A2A",
  endpoint: "#0E0E0E",
};

const chooserStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: PARCHMENT.bg,
    borderWidth: 1,
    borderColor: PARCHMENT.borderStrong,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    color: PARCHMENT.inkMuted,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 4,
  },
  title: {
    color: PARCHMENT.ink,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "600",
    marginBottom: 6,
  },
  rule: {
    width: 28,
    height: 2,
    backgroundColor: PARCHMENT.accent,
    marginBottom: 10,
  },
  subtitle: {
    color: PARCHMENT.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  optionList: { gap: spacing.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: PARCHMENT.border,
  },
  optionActive: {
    backgroundColor: PARCHMENT.endpoint,
    borderColor: PARCHMENT.endpoint,
  },
  optionBody: { flex: 1 },
  optEyebrow: {
    color: PARCHMENT.inkMuted,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 2,
  },
  optEyebrowActive: { color: "#E0B062" },
  optTitle: {
    color: PARCHMENT.ink,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  optTitleActive: { color: "#FFFFFF" },
  optRange: {
    color: PARCHMENT.inkMuted,
    fontSize: 12,
  },
  optRangeActive: { color: "#D9CDB1" },
  optTick: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: PARCHMENT.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  optTickActive: {
    borderColor: PARCHMENT.accent,
    backgroundColor: PARCHMENT.accent,
  },
  cancelBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: PARCHMENT.borderStrong,
    backgroundColor: "#FFFFFF",
  },
  cancelText: {
    color: PARCHMENT.inkMuted,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "600",
  },
});

export default DateRangePresets;
