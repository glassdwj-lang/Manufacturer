/**
 * Compact stat tile used in the trio Active/Completed/Total above the
 * commission list.
 */
import React from "react";
import { Text, View } from "react-native";
import { homeStyles } from "../styles";

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={homeStyles.stat}>
      <Text style={homeStyles.statValue}>{value}</Text>
      <Text style={homeStyles.statLabel}>{label}</Text>
    </View>
  );
}

export default Stat;
