import React from "react";
import { Text, View } from "react-native";
import { styles } from "../styles";

/** Single numeric stat box used in the COMMISSIONS card. */
export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
