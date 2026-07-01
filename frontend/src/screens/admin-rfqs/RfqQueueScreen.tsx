/**
 * RfqQueueScreen — admin RFQ list. Origins: gem_gallery (mirrored
 * from gem-gallery-193 via ingest / webhook) and admin_bespoke
 * (created here).
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

const STATUS_COLORS: Record<string, string> = {
  pending_review: "#7A5A15",
  broadcast_complete: "#164E3B",
  manufacturer_responded: "#2E5AA0",
  imported_to_quote: "#4A2E7A",
  client_quoted: "#0F4C4B",
  cancelled: "#7A1F1F",
  draft: "#3A3A3A",
  broadcasting: "#7A5A15",
};

export default function RfqQueueScreen() {
  const router = useRouter();
  const safeBack = useSafeBack("/(app)");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterOrigin, setFilterOrigin] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try { setItems(await api.listRfqs({ origin: filterOrigin })); }
    catch (e: any) { Alert.alert("Load failed", e?.message || "unknown"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filterOrigin]);

  useEffect(() => { load(); }, [load]);

  const ingest = async () => {
    try { const r = await api.ingestRfqsFromGemGallery();
      Alert.alert("Ingest complete", `Mirrored ${r.upserted} RFQ(s) from gem-gallery-193.`);
      await load();
    } catch (e: any) { Alert.alert("Ingest failed", e?.message || "unknown"); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top","bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="arrow-back" size={22} color={theme.textPrimary} /></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>RFQ Queue</Text>
        <TouchableOpacity onPress={() => router.push("/(app)/admin/rfqs/new")}>
          <Ionicons name="add" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-around", paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
        {[
          { key: undefined, label: "All" },
          { key: "gem_gallery" as const, label: "gem-gallery" },
          { key: "admin_bespoke" as const, label: "Bespoke" },
        ].map(o => (
          <TouchableOpacity key={o.label} onPress={() => setFilterOrigin(o.key as any)}>
            <Text style={{ color: filterOrigin === o.key ? theme.primary : theme.textMuted, fontSize: 12, fontWeight: filterOrigin === o.key ? "700" : "400" }}>{o.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={ingest} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="download" size={14} color={theme.primary} />
          <Text style={{ color: theme.primary, fontSize: 12 }}>Ingest</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: spacing.md, maxWidth: 520, width: "100%", alignSelf: "center" }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/(app)/admin/rfqs/${item.id}`)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Ionicons
                  name={item.origin === "admin_bespoke" ? "construct-outline" : "cloud-download-outline"}
                  size={16}
                  color={theme.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>
                    {item.client_name || "Unnamed client"} · {item.brand}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {item.piece_type_label || "?"} · {item.broadcast_count || 0} broadcast(s)
                  </Text>
                </View>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
                  backgroundColor: STATUS_COLORS[item.status] || "#3A3A3A",
                }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{item.status.replace(/_/g," ")}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: theme.textMuted, marginTop: 20 }}>No RFQs.</Text>}
        />
      )}
    </SafeAreaView>
  );
}
