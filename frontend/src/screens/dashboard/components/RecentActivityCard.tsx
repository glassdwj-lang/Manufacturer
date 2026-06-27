/** RECENT ACTIVITY card — latest events with deep-link to the full log. */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { styles } from "../styles";
import { relTime } from "../utils";
import type { DashboardData } from "../types";

export function RecentActivityCard({
  activity,
}: {
  activity: DashboardData["recent_activity"];
}) {
  const router = useRouter();
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardEyebrow}>RECENT ACTIVITY</Text>
        <TouchableOpacity onPress={() => router.push("/(app)/activity-log")}>
          <Text style={styles.cardLink}>FULL LOG</Text>
        </TouchableOpacity>
      </View>
      {activity.length === 0 ? (
        <Text style={styles.empty}>No activity recorded yet.</Text>
      ) : (
        activity.map((r) => (
          <View key={r.id} style={styles.actRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.actAction} numberOfLines={1}>
                {r.action}
              </Text>
              <Text style={styles.actActor} numberOfLines={1}>
                {r.actor_email}
              </Text>
            </View>
            <Text style={styles.actTime}>{relTime(r.at)}</Text>
          </View>
        ))
      )}
    </View>
  );
}
