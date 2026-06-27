/** NEW USERS card — clients / workshops / associates counters. */
import React from "react";
import { Text, View } from "react-native";
import { spacing } from "@/src/theme";
import { styles } from "../styles";

function Col({
  title,
  primary,
  sub,
}: {
  title: string;
  primary: string | number;
  sub: string;
}) {
  return (
    <View style={styles.newCol}>
      <Text style={styles.newColTitle}>{title}</Text>
      <Text style={styles.newColPrimary}>{primary}</Text>
      <Text style={styles.newColSub}>{sub}</Text>
    </View>
  );
}

export function NewUsersCard({
  newUsers,
  rangeActive,
  rangeCaption,
}: {
  newUsers: Record<string, number>;
  rangeActive: boolean;
  rangeCaption: string;
}) {
  const nu = newUsers;
  const renderSub = (sevenDay: number, thirtyDay: number) =>
    rangeActive ? "in selected period" : `last 7d  ·  ${thirtyDay} in 30d`;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardEyebrow}>NEW USERS</Text>
        {rangeActive && (
          <Text style={styles.cardLink} numberOfLines={1}>
            {rangeCaption.toUpperCase()}
          </Text>
        )}
      </View>
      <View style={[styles.statsRow, { marginTop: spacing.sm }]}>
        <Col
          title="CLIENTS"
          primary={rangeActive ? nu.client_in_range ?? 0 : nu.client_7d}
          sub={renderSub(nu.client_7d, nu.client_30d)}
        />
        <Col
          title="WORKSHOPS"
          primary={
            rangeActive
              ? nu.manufacturer_in_range ?? 0
              : nu.manufacturer_7d
          }
          sub={renderSub(nu.manufacturer_7d, nu.manufacturer_30d)}
        />
        <Col
          title="ASSOCIATES"
          primary={
            rangeActive ? nu.associate_in_range ?? 0 : nu.associate_7d
          }
          sub={renderSub(nu.associate_7d, nu.associate_30d)}
        />
      </View>
    </View>
  );
}
