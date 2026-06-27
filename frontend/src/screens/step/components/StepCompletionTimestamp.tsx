/** Compact "completed at China time" timestamp tile, role-aware. */
import React from "react";
import { Text, View } from "react-native";
import type { Step } from "@/src/api/client";
import { styles } from "../styles";
import { formatChinaTime } from "../utils";

export function StepCompletionTimestamp({
  step,
  isClient,
}: {
  step: Step;
  isClient: boolean;
}) {
  if (!step.completed || !step.completed_at_china) return null;
  return (
    <View style={styles.timestampBox}>
      <Text style={styles.tsEyebrow}>
        {isClient ? "COMPLETED" : "COMPLETED · CHINA TIME (CST)"}
      </Text>
      <Text style={styles.tsValue}>{formatChinaTime(step.completed_at_china)}</Text>
      <Text style={styles.tsSub}>
        {isClient
          ? step.forwarded_to_client
            ? "Received"
            : "Awaiting release"
          : step.forwarded_to_client
            ? "Forwarded to client"
            : "Awaiting associate forward"}
      </Text>
    </View>
  );
}
