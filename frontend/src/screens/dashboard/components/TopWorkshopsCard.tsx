/** TOP WORKSHOPS card — most-active manufacturers in the current range. */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { styles } from "../styles";
import type { DashboardData } from "../types";

export function TopWorkshopsCard({
  workshops,
  isAdmin,
}: {
  workshops: DashboardData["top_manufacturers"];
  isAdmin: boolean;
}) {
  const router = useRouter();
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardEyebrow}>TOP WORKSHOPS</Text>
        <TouchableOpacity onPress={() => router.push("/(app)/users")}>
          <Text style={styles.cardLink}>VIEW ALL</Text>
        </TouchableOpacity>
      </View>
      {workshops.length === 0 ? (
        <Text style={styles.empty}>No commissions yet.</Text>
      ) : (
        workshops.map((m) => {
          // Admin sees the real business name first, with the alias
          // appended as a secondary label so cross-referencing stays easy.
          const realName = m.name || "—";
          const alias = (m.alias || "").trim();
          const headline = isAdmin
            ? alias && alias !== realName
              ? `${realName}  ·  ${alias}`
              : realName
            : alias || realName;
          return (
            <View key={m.id} style={styles.workshopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.workshopName} numberOfLines={1}>
                  {headline}
                </Text>
                <Text style={styles.workshopMeta} numberOfLines={1}>
                  {m.email}
                </Text>
              </View>
              <TouchableOpacity
                testID={`workshop-active-${m.id}`}
                onPress={() =>
                  router.push({
                    pathname: "/(app)",
                    params: { mfg: m.id },
                  })
                }
                style={styles.workshopCountBox}
              >
                <Text style={styles.workshopCount}>{m.active_count}</Text>
                <Text style={styles.workshopCountLabel}>ACTIVE</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
}
