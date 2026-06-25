import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme, spacing } from "@/src/theme";

export function PhaseBadge({ phase }: { phase: string }) {
  return (
    <View style={styles.phaseBadge}>
      <Text style={styles.phaseBadgeText}>PHASE {phase}</Text>
    </View>
  );
}

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <View style={styles.progressOuter} testID="progress-bar">
      <View style={[styles.progressInner, { width: `${pct}%` }]} />
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
  progressOuter: {
    height: 2,
    backgroundColor: theme.border,
    width: "100%",
    overflow: "hidden",
  },
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
