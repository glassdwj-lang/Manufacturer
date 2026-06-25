import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Step } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { StepRow } from "./StepRow";

export interface PhaseSectionProps {
  phase: string;
  phaseTitle: string;
  steps: Step[];
  isOpen: boolean;
  onToggle: () => void;
  canEditStep: boolean;
  canForward: boolean;
  onPressStep: (stepNumber: number) => void;
}

/**
 * Collapsible block representing one of the 5 phases (I–V) on the order
 * detail screen. Shows the phase header (eyebrow + title + done count) and,
 * when open, the embedded step rows.
 */
export function PhaseSection({
  phase,
  phaseTitle,
  steps,
  isOpen,
  onToggle,
  canEditStep,
  canForward,
  onPressStep,
}: PhaseSectionProps) {
  const doneCount = steps.filter((s) => s.completed).length;
  const { t } = useI18n();
  return (
    <View style={styles.phaseBlock}>
      <TouchableOpacity
        testID={`phase-${phase}-toggle`}
        onPress={onToggle}
        style={styles.phaseHeader}
      >
        <View>
          <Text style={styles.phaseEyebrow}>{t("common.phase_with_value", { phase })}</Text>
          <Text style={styles.phaseTitle}>{phaseTitle}</Text>
        </View>
        <View style={styles.phaseRight}>
          <Text style={styles.phaseCount}>
            {doneCount}/{steps.length}
          </Text>
          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.primary}
          />
        </View>
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.stepsCol}>
          {steps.map((s, idx) => (
            <StepRow
              key={s.step_number}
              step={s}
              isLast={idx === steps.length - 1}
              canEdit={canEditStep}
              canForward={canForward}
              onPress={() => onPressStep(s.step_number)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  phaseBlock: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: spacing.md,
  },
  phaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  phaseEyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  phaseTitle: {
    color: theme.textPrimary,
    fontSize: 16,
    marginTop: 2,
  },
  phaseRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  phaseCount: { color: theme.textMuted, fontSize: 12, marginRight: 8 },
  stepsCol: { borderTopWidth: 1, borderTopColor: theme.border, paddingVertical: 4 },
});
