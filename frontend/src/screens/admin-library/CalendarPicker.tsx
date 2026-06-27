/**
 * CalendarPicker — Luxury parchment-style date-range picker modal.
 *
 * Visual language modelled after Somnio's "Past Reports" calendar:
 *   - Cream / parchment surface, square corners, no rounding.
 *   - Serif month header with bordered chevron buttons.
 *   - Sunday-first single-letter weekday columns (S M T W T F S).
 *   - Selected day endpoints render as a tall black filled rectangle.
 *   - In-range middle days carry a subtle warm tint.
 *   - Next/previous-month spillover days appear faded and unselectable.
 *
 * Range UX:
 *   - First tap (no anchor) seeds `from`.
 *   - Second tap on/after the anchor sets `to`.
 *   - Tap *before* the anchor → reset the anchor to keep range valid.
 *   - Tap after a complete range → start a fresh range.
 *
 * Emits `{ date_from, date_to }` ISO YYYY-MM-DD pair on Apply.
 */
import React, { useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, typography } from "@/src/theme";

// ---------------------------------------------------------------------------
// Parchment palette — local to this component so it stays consistent across
// libraries even though the rest of the app runs on the dark Atelier theme.
// ---------------------------------------------------------------------------
const PARCHMENT = {
  bg: "#F4ECDD",            // cream background
  surface: "#FAF5EA",       // slightly lighter container surface
  border: "#E2D6BB",        // subtle hairline
  borderStrong: "#C7B58E",
  ink: "#1A1A1A",           // body / numerals
  inkMuted: "#8A7E63",      // muted captions
  inkFaint: "#BFB29B",      // spillover (prev/next month) days
  accent: "#A05A2A",        // copper — for "today" + dots
  rangeTint: "rgba(160, 90, 42, 0.10)", // soft copper wash on in-range days
  endpoint: "#0E0E0E",      // tall black highlight
  endpointInk: "#FFFFFF",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Sunday-first to match the reference design.
const WEEKDAY_SINGLE = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function inRange(d: Date, from: Date | null, to: Date | null): boolean {
  if (!from || !to) return false;
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/**
 * Build a 6-row × 7-col grid for the given month, Sunday-first. Cells from
 * neighbouring months render as their own Date so they can be displayed
 * faded but the day numeral is still readable (matches the reference).
 */
type GridCell = { date: Date; inMonth: boolean };
function buildMonthGrid(year: number, month: number): GridCell[][] {
  const first = new Date(year, month, 1);
  // Sunday-first: JS getDay is already Sun=0..Sat=6.
  const leading = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: GridCell[] = [];
  // Leading spillover from previous month.
  if (leading > 0) {
    const prevDays = new Date(year, month, 0).getDate();
    for (let i = leading - 1; i >= 0; i -= 1) {
      cells.push({
        date: new Date(year, month - 1, prevDays - i),
        inMonth: false,
      });
    }
  }
  // Current month.
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  // Trailing spillover from next month — always fill to 42 cells (6 rows).
  let trail = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, trail), inMonth: false });
    trail += 1;
  }
  const rows: GridCell[][] = [];
  for (let i = 0; i < 6; i += 1) rows.push(cells.slice(i * 7, i * 7 + 7));
  return rows;
}

export function CalendarPicker({
  visible,
  initialFrom,
  initialTo,
  onClose,
  onApply,
  testID = "calendar-picker",
}: {
  visible: boolean;
  initialFrom: string;
  initialTo: string;
  onClose: () => void;
  onApply: (range: { date_from: string; date_to: string }) => void;
  testID?: string;
}) {
  const today = new Date();
  const seedDate = parseIso(initialFrom) || parseIso(initialTo) || today;
  const [viewYear, setViewYear] = useState(seedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(seedDate.getMonth());
  const [draftFrom, setDraftFrom] = useState<string>(initialFrom);
  const [draftTo, setDraftTo] = useState<string>(initialTo);

  // Reset draft state whenever the modal re-opens.
  React.useEffect(() => {
    if (!visible) return;
    setDraftFrom(initialFrom);
    setDraftTo(initialTo);
    const seed = parseIso(initialFrom) || parseIso(initialTo) || new Date();
    setViewYear(seed.getFullYear());
    setViewMonth(seed.getMonth());
  }, [visible, initialFrom, initialTo]);

  const grid = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );
  const fromDate = parseIso(draftFrom);
  const toDate = parseIso(draftTo);

  const handlePick = (d: Date) => {
    const iso10 = iso(d.getFullYear(), d.getMonth(), d.getDate());
    if (!draftFrom && !draftTo) {
      setDraftFrom(iso10);
      return;
    }
    if (draftFrom && draftTo) {
      setDraftFrom(iso10);
      setDraftTo("");
      return;
    }
    if (draftFrom && !draftTo) {
      const anchor = parseIso(draftFrom);
      if (anchor && d.getTime() < anchor.getTime()) {
        setDraftFrom(iso10);
        return;
      }
      setDraftTo(iso10);
      return;
    }
    setDraftFrom(iso10);
    setDraftTo("");
  };

  const monthForward = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };
  const monthBack = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const canApply = !!draftFrom;
  const clearAll = () => {
    setDraftFrom("");
    setDraftTo("");
  };

  // Format range summary like "27 Jun 2026 → 29 Jun 2026".
  const fmtLong = (s: string): string => {
    const d = parseIso(s);
    if (!d) return "";
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  };
  const rangeSummary = draftFrom && draftTo
    ? `${fmtLong(draftFrom)} → ${fmtLong(draftTo)}`
    : draftFrom
      ? `${fmtLong(draftFrom)} → tap an end date`
      : "Tap a date to begin";

  // Step-by-step instruction banner so users always know the next action
  // (and so APPLY never looks like the only option after the first tap).
  const step: "start" | "end" | "done" = !draftFrom
    ? "start"
    : !draftTo
      ? "end"
      : "done";
  const stepCopy: Record<typeof step, { eyebrow: string; line: string }> = {
    start: {
      eyebrow: "STEP 1 OF 2",
      line: "Tap your START date on the calendar below.",
    },
    end: {
      eyebrow: "STEP 2 OF 2",
      line: "Now tap your END date — or apply as a single day.",
    },
    done: {
      eyebrow: "RANGE READY",
      line: "Tap APPLY to filter the library — or refine your dates.",
    },
  };

  // Day-count for the dynamic APPLY label.
  const dayCount = (() => {
    if (!fromDate) return 0;
    const end = toDate || fromDate;
    const ms = end.getTime() - fromDate.getTime();
    return Math.max(1, Math.round(ms / 86_400_000) + 1);
  })();
  const applyLabel = !draftFrom
    ? "APPLY"
    : draftTo
      ? `APPLY · ${dayCount} DAYS`
      : "APPLY · 1 DAY";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        testID={`${testID}-backdrop`}
      >
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Eyebrow + Title */}
          <Text style={styles.eyebrow}>YOUR REPORT · BY DATE</Text>
          <Text style={styles.title}>Custom Range</Text>
          <View style={styles.titleRule} />
          <Text style={styles.subtitle}>
            Pick any past day — or two — to set the range for this library.
          </Text>

          {/* Step banner — always tells the user exactly what to do next. */}
          <View
            style={[
              styles.stepBanner,
              step === "end" && styles.stepBannerActive,
              step === "done" && styles.stepBannerDone,
            ]}
          >
            <Text
              style={[
                styles.stepEyebrow,
                step === "end" && styles.stepEyebrowActive,
                step === "done" && styles.stepEyebrowDone,
              ]}
            >
              {stepCopy[step].eyebrow}
            </Text>
            <Text
              style={[
                styles.stepLine,
                step === "end" && styles.stepLineActive,
              ]}
            >
              {stepCopy[step].line}
            </Text>
          </View>

          {/* Calendar container */}
          <View style={styles.calCard}>
            {/* Header — month nav */}
            <View style={styles.headerRow}>
              <TouchableOpacity
                testID={`${testID}-prev-month`}
                onPress={monthBack}
                style={styles.navBtn}
                hitSlop={6}
              >
                <Ionicons name="chevron-back" size={16} color={PARCHMENT.ink} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              <TouchableOpacity
                testID={`${testID}-next-month`}
                onPress={monthForward}
                style={styles.navBtn}
                hitSlop={6}
              >
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={PARCHMENT.ink}
                />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
            </View>

            {/* Weekday labels */}
            <View style={styles.weekRow}>
              {WEEKDAY_SINGLE.map((n, idx) => (
                <Text key={`${n}-${idx}`} style={styles.weekText}>
                  {n}
                </Text>
              ))}
            </View>

            {/* Grid */}
            {grid.map((row, ri) => (
              <View key={`r${ri}`} style={styles.gridRow}>
                {row.map((cell, ci) => {
                  const { date, inMonth } = cell;
                  const isStart = sameDay(date, fromDate);
                  const isEnd = sameDay(date, toDate);
                  const between = inRange(date, fromDate, toDate);
                  const isToday = sameDay(date, today);
                  const isEndpoint = isStart || isEnd;
                  const cellIso = iso(
                    date.getFullYear(),
                    date.getMonth(),
                    date.getDate(),
                  );
                  return (
                    <TouchableOpacity
                      key={`r${ri}c${ci}`}
                      testID={`${testID}-day-${cellIso}`}
                      onPress={() => handlePick(date)}
                      activeOpacity={0.7}
                      style={styles.cellWrap}
                    >
                      {/* Tall black rectangle for endpoint */}
                      {isEndpoint && <View style={styles.endpointFill} />}
                      {/* Subtle wash for in-between days */}
                      {between && !isEndpoint && (
                        <View style={styles.rangeFill} />
                      )}
                      <Text
                        style={[
                          styles.dayText,
                          !inMonth && styles.dayTextFaint,
                          isEndpoint && styles.dayTextEndpoint,
                          between && !isEndpoint && styles.dayTextBetween,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                      {/* Tiny "today" dot under non-endpoint today */}
                      {isToday && !isEndpoint && (
                        <View style={styles.todayDot} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Footer — range summary + actions */}
          <View style={styles.footer}>
            <View style={{ flex: 1 }}>
              <Text style={styles.footerLabel}>SELECTED RANGE</Text>
              <Text style={styles.footerValue} numberOfLines={1}>
                {rangeSummary}
              </Text>
            </View>
            <TouchableOpacity
              testID={`${testID}-clear`}
              onPress={clearAll}
              style={styles.clearBtn}
            >
              <Text style={styles.clearText}>CLEAR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`${testID}-apply`}
              onPress={() => {
                if (!canApply) return;
                onApply({
                  date_from: draftFrom,
                  date_to: draftTo || draftFrom,
                });
              }}
              disabled={!canApply}
              style={[styles.applyBtn, !canApply && { opacity: 0.4 }]}
            >
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              <Text style={styles.applyText}>{applyLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const SCREEN_W = Dimensions.get("window").width;
const SHEET_MAX = Math.min(SCREEN_W - 24, 720);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  sheet: {
    width: "100%",
    maxWidth: SHEET_MAX,
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
    fontFamily: typography.sansMedium,
    marginBottom: 4,
  },
  title: {
    color: PARCHMENT.ink,
    fontSize: 28,
    lineHeight: 32,
    fontFamily: typography.serifBold,
    marginBottom: 6,
  },
  titleRule: {
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
    fontFamily: typography.sans,
  },
  stepBanner: {
    borderWidth: 1,
    borderColor: PARCHMENT.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md,
  },
  stepBannerActive: {
    borderColor: PARCHMENT.accent,
    backgroundColor: "rgba(160, 90, 42, 0.08)",
  },
  stepBannerDone: {
    borderColor: PARCHMENT.endpoint,
    backgroundColor: "#1A1A1A",
  },
  stepEyebrow: {
    color: PARCHMENT.inkMuted,
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: typography.sansSemi,
    marginBottom: 3,
  },
  stepEyebrowActive: { color: PARCHMENT.accent },
  stepEyebrowDone: { color: "#E0B062" },
  stepLine: {
    color: PARCHMENT.ink,
    fontSize: 13,
    fontFamily: typography.sansMedium,
    lineHeight: 18,
  },
  stepLineActive: { color: PARCHMENT.ink },
  calCard: {
    backgroundColor: PARCHMENT.surface,
    borderWidth: 1,
    borderColor: PARCHMENT.border,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: 12,
  },
  navBtn: {
    width: 32,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: PARCHMENT.border,
    backgroundColor: "#FFFFFF",
  },
  monthTitle: {
    color: PARCHMENT.ink,
    fontSize: 22,
    fontFamily: typography.serifBold,
    paddingHorizontal: 6,
  },
  weekRow: {
    flexDirection: "row",
    paddingVertical: 8,
    marginBottom: 2,
  },
  weekText: {
    flex: 1,
    textAlign: "center",
    color: PARCHMENT.inkMuted,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: typography.sansMedium,
  },
  gridRow: { flexDirection: "row" },
  cellWrap: {
    flex: 1,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  // The tall, narrow black rectangle that highlights an endpoint day.
  endpointFill: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: "18%",
    right: "18%",
    backgroundColor: PARCHMENT.endpoint,
  },
  // Subtle wash on in-between days.
  rangeFill: {
    position: "absolute",
    top: 6,
    bottom: 6,
    left: 0,
    right: 0,
    backgroundColor: PARCHMENT.rangeTint,
  },
  dayText: {
    color: PARCHMENT.ink,
    fontSize: 15,
    fontFamily: typography.sans,
  },
  dayTextFaint: { color: PARCHMENT.inkFaint },
  dayTextEndpoint: {
    color: PARCHMENT.endpointInk,
    fontFamily: typography.sansSemi,
  },
  dayTextBetween: { color: PARCHMENT.ink, fontFamily: typography.sansMedium },
  todayDot: {
    position: "absolute",
    bottom: 8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: PARCHMENT.accent,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: PARCHMENT.border,
  },
  footerLabel: {
    color: PARCHMENT.inkMuted,
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: typography.sansMedium,
  },
  footerValue: {
    color: PARCHMENT.ink,
    fontSize: 13,
    marginTop: 2,
    fontFamily: typography.sansMedium,
  },
  clearBtn: {
    borderWidth: 1,
    borderColor: PARCHMENT.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  clearText: {
    color: PARCHMENT.inkMuted,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: typography.sansSemi,
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: PARCHMENT.endpoint,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  applyText: {
    color: "#FFFFFF",
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: typography.sansSemi,
  },
});

export default CalendarPicker;
