/**
 * MfgRfqListScreen — a manufacturer's inbox: RFQ broadcasts assigned
 * to them. Expiry states shown per broadcast.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, Text,
  TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

export default function MfgRfqListScreen() {
  const router = useRouter();
  const safeBack = useSafeBack("/(app)");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.mfgListRfqs()); }
    catch (e: any) { Alert.alert("Load failed", e?.message || "unknown"); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top","bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="arrow-back" size={22} color={theme.textPrimary} /></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>My RFQs</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: spacing.md, maxWidth: 520, width: "100%", alignSelf: "center" }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />}
          renderItem={({ item }) => {
            const bc = (item.broadcasts || [])[0];
            return (
              <TouchableOpacity onPress={() => router.push(`/(app)/manufacturer/rfqs/${item.id}`)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.primary, fontWeight: "700" }}>{bc?.serial_display || "—"}</Text>
                    <Text style={{ color: theme.textPrimary, fontSize: 13 }}>
                      {item.client_name || "Unnamed"} · {item.piece_type_label}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>expires {(bc?.expires_at || "").slice(0,10)}</Text>
                  </View>
                  <Text style={{ color: bc?.status === "responded" ? "#5EBB7F" : bc?.status === "expired" ? "#E06666" : theme.textPrimary, fontSize: 11, fontWeight: "700" }}>
                    {bc?.status}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: theme.textMuted, marginTop: 20 }}>No RFQs assigned.</Text>}
        />
      )}
    </SafeAreaView>
  );
}
