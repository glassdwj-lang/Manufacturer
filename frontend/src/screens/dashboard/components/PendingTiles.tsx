/** Two side-by-side warning tiles: PENDING APPROVALS + MISSING CONTACTS. */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "@/src/theme";
import { styles } from "../styles";

export function PendingTiles({
  pendingApprovals,
  missingContacts,
  workshopsTotal,
}: {
  pendingApprovals: number;
  missingContacts: number;
  workshopsTotal: number;
}) {
  const router = useRouter();
  return (
    <View style={styles.cardRow}>
      <TouchableOpacity
        style={[styles.miniCard, styles.miniCardWarn]}
        onPress={() => router.push("/(app)/approvals")}
      >
        <Ionicons name="hourglass-outline" size={20} color="#C8A044" />
        <Text style={styles.miniValue}>{pendingApprovals}</Text>
        <Text style={styles.miniLabel}>PENDING APPROVALS</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.miniCard}
        onPress={() => router.push("/(app)/users")}
      >
        <Ionicons
          name="alert-circle-outline"
          size={20}
          color={theme.primary}
        />
        <Text style={styles.miniValue}>
          {missingContacts} / {workshopsTotal}
        </Text>
        <Text style={styles.miniLabel}>MISSING CONTACTS</Text>
      </TouchableOpacity>
    </View>
  );
}
