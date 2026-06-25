import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme, spacing } from "@/src/theme";
import { useI18n } from "@/src/i18n";

export function PhaseBadge({ phase }: { phase: string }) {
  const { t } = useI18n();
  return (
    <View style={styles.phaseBadge}>
      <Text style={styles.phaseBadgeText}>{t("common.phase_with_value", { phase })}</Text>
    </View>
  );
}

export function CompletedBadge({ label = "COMPLETED" }: { label?: string }) {
  return (
    <View style={styles.completedBadge}>
      <Text style={styles.completedBadgeText}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ current, total }: { current: number; total: number }) {
  // Render `total` discrete segments so the viewer can see exactly which
  // step the commission is at — matches the 26-step provenance journey.
  // The first unfilled segment ("you-are-here") gets a slightly stronger
  // outline so the next step stands out at a glance.
  const safeTotal = Math.max(total | 0, 1);
  const safeCurrent = Math.max(Math.min(current | 0, safeTotal), 0);
  return (
    <View style={styles.progressOuter} testID="progress-bar">
      {Array.from({ length: safeTotal }, (_, i) => {
        const filled = i < safeCurrent;
        const isNext = !filled && i === safeCurrent;
        const segmentStyle = filled
          ? styles.progressSegmentFilled
          : isNext
          ? styles.progressSegmentNext
          : styles.progressSegmentEmpty;
        return <View key={i} style={[styles.progressSegment, segmentStyle]} />;
      })}
    </View>
  );
}

export function Eyebrow({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <Text testID={testID} style={styles.eyebrow}>
      {children}
    </Text>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function StatusPill({ status }: { status: string }) {
  const color =
    status === "completed" ? theme.success : status === "shipped" ? theme.primary : theme.textSecondary;
  return (
    <View style={[styles.statusPill, { borderColor: color }]}>
      <Text style={[styles.statusPillText, { color }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  phaseBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: theme.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  phaseBadgeText: {
    color: theme.primary,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "600",
  },
  completedBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: theme.success,
    backgroundColor: "rgba(46, 204, 113, 0.08)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  completedBadgeText: {
    color: theme.success,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  progressOuter: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 8,
    width: "100%",
    gap: 2,
  },
  progressSegment: {
    flex: 1,
    height: 8,
    minWidth: 2,
  },
  progressSegmentFilled: {
    backgroundColor: theme.primary,
  },
  progressSegmentEmpty: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.border,
  },
  progressSegmentNext: {
    // "You-are-here" indicator: solid gold outline + soft tint so the next
    // step pops without breaking the calm line of empty segments.
    backgroundColor: "rgba(212, 175, 55, 0.16)",
    borderWidth: 1,
    borderColor: theme.primary,
  },
  // Retained in case external consumers reference the legacy fill style.
  progressInner: {
    height: 2,
    backgroundColor: theme.primary,
  },
  eyebrow: {
    color: theme.primary,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
    marginVertical: spacing.md,
  },
  statusPill: {
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  statusPillText: { fontSize: 9, letterSpacing: 2, fontWeight: "700" },
});
