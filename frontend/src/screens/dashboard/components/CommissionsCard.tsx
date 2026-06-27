/** COMMISSIONS card — active/completed/total counts + by-phase bars. */
import React from "react";
import { Text, View } from "react-native";
import { Stat } from "./Stat";
import { styles } from "../styles";
import type { DashboardData } from "../types";

export function CommissionsCard({ data }: { data: DashboardData["commissions"] }) {
  const phaseEntries = Object.entries(data.by_phase || {});
  const maxPhase = Math.max(1, ...phaseEntries.map(([, v]) => v as number));
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>COMMISSIONS</Text>
      <View style={styles.statsRow}>
        <Stat label="ACTIVE" value={data.active} />
        <Stat label="COMPLETED" value={data.completed} />
        <Stat label="TOTAL" value={data.total} />
      </View>
      {phaseEntries.length > 0 && (
        <>
          <Text style={styles.cardSub}>BY PHASE</Text>
          <View style={{ gap: 6, marginTop: 6 }}>
            {phaseEntries.map(([k, v]) => (
              <View key={k} style={styles.phaseRow}>
                <Text style={styles.phaseLabel}>P{k}</Text>
                <View style={styles.phaseBar}>
                  <View
                    style={[
                      styles.phaseBarFill,
                      {
                        width: `${Math.round(
                          ((v as number) / maxPhase) * 100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.phaseValue}>{v as number}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
