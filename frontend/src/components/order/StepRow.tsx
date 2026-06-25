import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Step } from "@/src/api/client";
import { theme } from "@/src/theme";
import { formatChinaTime } from "@/src/utils/format";

export interface StepRowProps {
  step: Step;
  isLast: boolean;
  canEdit: boolean;
  canForward: boolean;
  onPress: () => void;
}

/**
 * A single row inside a phase accordion. Shows the dot/line rail, step
 * number + title, optional completion timestamp and forwarding state, and
 * any attached notes/photos.
 */
export function StepRow({ step, isLast, canEdit, canForward, onPress }: StepRowProps) {
  const dotColor = step.completed ? theme.primary : theme.border;
  const interactive = canEdit || canForward;
  return (
    <TouchableOpacity
      testID={`step-row-${step.step_number}`}
      style={styles.stepRow}
      onPress={onPress}
      disabled={!interactive}
      activeOpacity={interactive ? 0.7 : 1}
    >
      <View style={styles.stepRail}>
        <View style={[styles.stepDot, { backgroundColor: dotColor }]} />
        {!isLast && <View style={[styles.stepLine, { backgroundColor: theme.border }]} />}
      </View>
      <View style={styles.stepBody}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepNum}>{String(step.step_number).padStart(2, "0")}</Text>
          <Text style={styles.stepTitle}>{step.title}</Text>
          {step.completed && (
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={theme.primary}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
        {step.description ? <Text style={styles.stepDesc}>{step.description}</Text> : null}
        {step.completed && step.completed_at_china && (
          <Text style={styles.stepMeta}>
            ✓ {formatChinaTime(step.completed_at_china)} CST
            {step.forwarded_to_client ? "  ·  Sent to client" : "  ·  Pending forward"}
          </Text>
        )}
        {!!step.photos?.length && (
          <Text style={styles.stepMeta}>{Platform.OS === "web" ? "\u{1F4F7}" : "\u{1F4F7}"} {step.photos.length} photo(s)</Text>
        )}
        {!!step.notes && <Text style={styles.stepNotes}>{step.notes}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12 },
  stepRail: { width: 20, alignItems: "center" },
  stepDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  stepLine: { width: 1, flex: 1, marginTop: 4 },
  stepBody: { flex: 1, marginLeft: 8 },
  stepHeader: { flexDirection: "row", alignItems: "center" },
  stepNum: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: "700",
    width: 24,
  },
  stepTitle: { color: theme.textPrimary, fontSize: 14, flex: 1 },
  stepDesc: { color: theme.textMuted, fontSize: 11, marginLeft: 24, marginTop: 2 },
  stepMeta: { color: theme.textMuted, fontSize: 11, marginTop: 4, marginLeft: 24 },
  stepNotes: {
    color: theme.textPrimary,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 32,
    fontStyle: "italic",
  },
});
