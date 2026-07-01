/**
 * QuotesScreen — admin list of quotes. Quotes are typically created
 * via `Import to Quote` from a responded RFQ broadcast (Phase E) but
 * can also be created directly. This screen lets admins see totals
 * at a glance and open a quote for editing.
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

export default function QuotesScreen() {
  const router = useRouter();
  const safeBack = useSafeBack("/(app)");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.listQuotes()); }
    catch (e: any) { Alert.alert("Load failed", e?.message || "unknown"); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top","bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="arrow-back" size={22} color={theme.textPrimary} /></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>Quotes</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={(q) => q.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: spacing.md, maxWidth: 520, width: "100%", alignSelf: "center" }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/(app)/admin/quotes/${item.id}`)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  {item.serial_display && (
                    <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 13 }}>{item.serial_display}</Text>
                  )}
                  <Text style={{ color: theme.textPrimary, fontSize: 13 }}>
                    {item.jewelry_name || item.inputs?.piece_description || "(no name)"}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    USD {(item.inputs?.ring_cost_usd || 0).toFixed(0)} · markup {item.inputs?.markup_pct}%
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: "700" }}>
                    {item.totals?.total_sell_price_inc_gst_aud ? `A$${Math.round(item.totals.total_sell_price_inc_gst_aud)}` : "—"}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }}>{item.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: theme.textMuted, marginTop: 20 }}>No quotes yet. Import one from a responded RFQ broadcast.</Text>}
        />
      )}
    </SafeAreaView>
  );
}
