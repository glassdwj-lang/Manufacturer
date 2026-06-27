/**
 * Last-30-days commission activity bar chart.
 *
 * Renders a compact stacked bar chart that combines three atelier-wide
 * signals per day:
 *   - New commissions (golden)
 *   - Steps forwarded to client (champagne)
 *   - Digital DNAs ready (emerald)
 *
 * Designed to sit under the home dashboard filter strip — fixed height,
 * fills available width, gracefully handles all-zero days by drawing a
 * faint baseline so the chart still "feels alive" on a quiet week.
 *
 * Self-contained: no external chart lib. Built with View widths so it
 * works on Expo Web + native without bridging.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useI18n } from "@/src/i18n";

type Bucket = {
  date: string;
  commissions: number;
  forwarded: number;
  dnas: number;
  total: number;
};

type Payload = {
  days: number;
  start: string | null;
  end: string | null;
  series: Bucket[];
  totals: { commissions: number; forwarded: number; dnas: number };
};

const COLOR_COMMISSIONS = theme.primary; // gold
const COLOR_FORWARDED = "#D9B47A"; // champagne
const COLOR_DNAS = "#5B9279"; // emerald

function formatRange(start: string | null, end: string | null) {
  if (!start || !end) return "";
  try {
    const a = new Date(start);
    const b = new Date(end);
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
    return `${a.toLocaleDateString(undefined, opts)} → ${b.toLocaleDateString(
      undefined,
      opts,
    )}`;
  } catch {
    return `${start} → ${end}`;
  }
}

export function HomeDailyChart({
  externalRange,
}: {
  /** When provided, overrides the internal 7D/30D/90D pills and shows
   *  the chart for the given inclusive YYYY-MM-DD range. Pass `null` /
   *  undefined to keep the legacy "rolling N days" picker. */
  externalRange?: { date_from?: string; date_to?: string } | null;
} = {}) {
  const { t } = useI18n();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // An external range (set by a parent screen's preset bar) takes precedence
  // over the internal 7/30/90 pills. We hide the pills entirely while it's
  // active so users don't see two competing date controls.
  const hasExternalRange = !!(
    externalRange && (externalRange.date_from || externalRange.date_to)
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const apiCall = hasExternalRange
      ? api.adminInsightsDaily({
          date_from: externalRange?.date_from,
          date_to: externalRange?.date_to,
        })
      : api.adminInsightsDaily(days);
    apiCall
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e: any) => {
        if (cancelled) return;
        console.warn("[home-chart]", e);
        setError(e?.message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, hasExternalRange, externalRange?.date_from, externalRange?.date_to]);

  const maxTotal = useMemo(() => {
    if (!data || !data.series.length) return 0;
    return Math.max(...data.series.map((b) => b.total));
  }, [data]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{t("home.chart.eyebrow")}</Text>
          <Text style={styles.title}>
            {hasExternalRange
              ? "Atelier Pulse"
              : t("home.chart.title", { n: days })}
          </Text>
          {data && (
            <Text style={styles.range}>{formatRange(data.start, data.end)}</Text>
          )}
        </View>
        {!hasExternalRange && (
          <View style={styles.scopeRow}>
            {[7, 30, 90].map((n) => {
              const sel = days === n;
              return (
                <TouchableOpacity
                  key={n}
                  testID={`home-chart-scope-${n}`}
                  onPress={() => setDays(n as 7 | 30 | 90)}
                  style={[styles.scopeChip, sel && styles.scopeChipSel]}
                >
                  <Text
                    style={[styles.scopeText, sel && styles.scopeTextSel]}
                  >{`${n}D`}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Totals row — quick at-a-glance summary, mirrors the gem-gallery card */}
      {data && (
        <View style={styles.totalsRow}>
          <SummaryPill
            label={t("home.chart.legend.commissions")}
            value={data.totals.commissions}
            color={COLOR_COMMISSIONS}
          />
          <SummaryPill
            label={t("home.chart.legend.forwarded")}
            value={data.totals.forwarded}
            color={COLOR_FORWARDED}
          />
          <SummaryPill
            label={t("home.chart.legend.dnas")}
            value={data.totals.dnas}
            color={COLOR_DNAS}
          />
        </View>
      )}

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      )}
      {error && !loading && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      {data && !loading && (
        <>
          <View style={styles.chart} testID="home-chart-canvas">
            {data.series.map((b, idx) => {
              const isActive = activeIdx === idx;
              const total = b.total;
              const pct = maxTotal === 0 ? 0 : total / maxTotal;
              // baseline so days with 0 still draw a faint tick
              const heightPct = Math.max(pct, total === 0 ? 0.04 : 0.06);
              const commissionsPct =
                total === 0 ? 0 : b.commissions / total;
              const forwardedPct = total === 0 ? 0 : b.forwarded / total;
              const dnasPct = total === 0 ? 0 : b.dnas / total;
              return (
                <TouchableOpacity
                  key={b.date}
                  testID={`home-chart-bar-${b.date}`}
                  activeOpacity={0.7}
                  onPress={() => setActiveIdx(isActive ? null : idx)}
                  style={styles.barCol}
                >
                  <View
                    style={[
                      styles.barFill,
                      { height: `${heightPct * 100}%` },
                      total === 0 && styles.barEmpty,
                    ]}
                  >
                    {/* Stacked segments; tallest at the top */}
                    {total > 0 ? (
                      <>
                        {b.dnas > 0 && (
                          <View
                            style={{
                              height: `${dnasPct * 100}%`,
                              backgroundColor: COLOR_DNAS,
                            }}
                          />
                        )}
                        {b.forwarded > 0 && (
                          <View
                            style={{
                              height: `${forwardedPct * 100}%`,
                              backgroundColor: COLOR_FORWARDED,
                            }}
                          />
                        )}
                        {b.commissions > 0 && (
                          <View
                            style={{
                              height: `${commissionsPct * 100}%`,
                              backgroundColor: COLOR_COMMISSIONS,
                            }}
                          />
                        )}
                      </>
                    ) : null}
                  </View>
                  {isActive && (
                    <View style={styles.tooltip} pointerEvents="none">
                      <Text style={styles.tooltipDate}>
                        {new Date(b.date).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                        })}
                      </Text>
                      <Text style={styles.tooltipLine}>
                        <View
                          style={[styles.dot, { backgroundColor: COLOR_COMMISSIONS }]}
                        />{" "}
                        {b.commissions}
                      </Text>
                      <Text style={styles.tooltipLine}>
                        <View
                          style={[styles.dot, { backgroundColor: COLOR_FORWARDED }]}
                        />{" "}
                        {b.forwarded}
                      </Text>
                      <Text style={styles.tooltipLine}>
                        <View
                          style={[styles.dot, { backgroundColor: COLOR_DNAS }]}
                        />{" "}
                        {b.dnas}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          {/* X-axis sparse labels — first and last day */}
          <View style={styles.axisRow}>
            <Text style={styles.axisLabel}>
              {data.series[0]
                ? new Date(data.series[0].date).toLocaleDateString(undefined, {
                    day: "2-digit",
                    month: "short",
                  })
                : ""}
            </Text>
            <Text style={styles.axisLabel}>
              {data.series[data.series.length - 1]
                ? new Date(
                    data.series[data.series.length - 1].date,
                  ).toLocaleDateString(undefined, {
                    day: "2-digit",
                    month: "short",
                  })
                : ""}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function SummaryPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.summaryPill}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  eyebrow: {
    color: theme.primary,
    fontSize: 9,
    letterSpacing: 2,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 14,
    letterSpacing: 1,
    marginTop: 2,
  },
  range: {
    color: theme.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  scopeRow: { flexDirection: "row", gap: 4 },
  scopeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  scopeChipSel: { borderColor: theme.primary },
  scopeText: { color: theme.textMuted, fontSize: 9, letterSpacing: 1 },
  scopeTextSel: { color: theme.primary },
  totalsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  summaryPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  summaryLabel: { color: theme.textMuted, fontSize: 9, letterSpacing: 1 },
  summaryValue: {
    color: theme.textPrimary,
    fontSize: 13,
    marginTop: 1,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 100,
    gap: 2,
    marginTop: spacing.sm,
    paddingTop: 20, // tooltip headroom
  },
  barCol: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
    alignItems: "stretch",
    position: "relative",
  },
  barFill: {
    width: "100%",
    flexDirection: "column-reverse",
    overflow: "hidden",
  },
  barEmpty: {
    backgroundColor: theme.borderSubtle,
    opacity: 0.4,
  },
  tooltip: {
    position: "absolute",
    bottom: "100%",
    left: -22,
    minWidth: 64,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: "#0F0F0F",
    borderWidth: 1,
    borderColor: theme.primary,
    zIndex: 5,
  },
  tooltipDate: {
    color: theme.primary,
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
  },
  tooltipLine: {
    color: theme.textPrimary,
    fontSize: 10,
    lineHeight: 14,
  },
  axisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  axisLabel: {
    color: theme.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
  center: { paddingVertical: spacing.lg, alignItems: "center" },
  errorText: {
    color: "#FF6B6B",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: spacing.sm,
  },
});

export default HomeDailyChart;
