/**
 * QuotesScreen — admin list of quotes.
 *
 * Two categories share this list:
 *   • Brand quotes: created via `Import to Quote` from a responded RFQ
 *     broadcast — serials are SC/SA/SB piece-type formatted.
 *   • Freelance quotes: independent `dwj-XXXX` serial namespace, no RFQ
 *     link. Created via the "+ New Freelance" button.
 *
 * A filter chip row lets admin narrow to a single category.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

type Filter = "all" | "brand" | "freelance";

export default function QuotesScreen() {
  const router = useRouter();
  const safeBack = useSafeBack("/(app)");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("brand");
  const [showNewModal, setShowNewModal] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (f: Filter = filter) => {
    try {
      const flag = f === "freelance" ? "true" : f === "brand" ? "false" : undefined;
      setItems(await api.listQuotes(flag));
    } catch (e: any) {
      Alert.alert("Load failed", e?.message || "unknown");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { load(filter); }, [load, filter]);

  const createFreelance = async () => {
    setCreating(true);
    try {
      const q = await api.createFreelanceQuote({
        piece_description: newDesc.trim() || undefined,
      });
      setShowNewModal(false);
      setNewDesc("");
      // Jump straight into the new quote to fill in numbers.
      router.push(`/(app)/admin/quotes/${q.id}`);
    } catch (e: any) {
      Alert.alert("Create failed", e?.message || "unknown");
    } finally {
      setCreating(false);
    }
  };

  const Chip = ({ value, label }: { value: Filter; label: string }) => {
    const active = filter === value;
    return (
      <TouchableOpacity
        onPress={() => setFilter(value)}
        style={{
          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
          borderWidth: 1,
          borderColor: active ? theme.primary : theme.border,
          backgroundColor: active ? theme.primary : "transparent",
          marginRight: 6,
        }}
      >
        <Text style={{
          color: active ? "#fff" : theme.textPrimary,
          fontSize: 11, fontWeight: "700",
        }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top","bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="arrow-back" size={22} color={theme.textPrimary} /></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>Quotes</Text>
        <TouchableOpacity onPress={() => setShowNewModal(true)}>
          <Ionicons name="add-circle" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <View style={{ flexDirection: "row", paddingHorizontal: spacing.md, marginBottom: spacing.sm, flexWrap: "wrap" }}>
        <Chip value="all"       label="All" />
        <Chip value="brand"     label="Brand (SC/SA/SB)" />
        <Chip value="freelance" label="Freelance (dwj)" />
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={(q) => q.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: spacing.md, maxWidth: 520, width: "100%", alignSelf: "center" }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />}
          renderItem={({ item }) => {
            const isFreelance = !!item.is_freelance;
            const serial = isFreelance
              ? item.freelance_serial
              : item.serial_display;
            return (
              <TouchableOpacity onPress={() => router.push(`/(app)/admin/quotes/${item.id}`)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    {serial && (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={{
                          color: isFreelance ? "#E0A85B" : theme.primary,
                          fontWeight: "700", fontSize: 13,
                        }}>{serial}</Text>
                        {isFreelance && (
                          <View style={{
                            marginLeft: 6, paddingHorizontal: 5, paddingVertical: 1,
                            borderRadius: 3, backgroundColor: "#3A2E1A",
                          }}>
                            <Text style={{ color: "#E0A85B", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 }}>
                              FREELANCE
                            </Text>
                          </View>
                        )}
                      </View>
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
            );
          }}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: theme.textMuted, marginTop: 20 }}>
              {filter === "freelance"
                ? "No freelance quotes yet. Tap + to create a dwj-XXXX quote."
                : filter === "brand"
                  ? "No brand quotes yet. Import one from a responded RFQ broadcast."
                  : "No quotes yet."}
            </Text>
          }
        />
      )}

      {/* --- New Freelance Quote modal --- */}
      <Modal
        visible={showNewModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewModal(false)}
      >
        <View style={{
          flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "center", alignItems: "center", padding: spacing.md,
        }}>
          <View style={{
            backgroundColor: theme.bg, borderRadius: 12, padding: spacing.md,
            borderWidth: 1, borderColor: theme.border,
            width: "100%", maxWidth: 400,
          }}>
            <Text style={{
              color: theme.textPrimary, fontSize: 16, fontWeight: "700",
              marginBottom: spacing.xs,
            }}>
              New Freelance Quote
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: spacing.md }}>
              Creates a `dwj-XXXX` serial outside the SC/SA/SB brand namespace.
              You can leave the description empty and fill it in later.
            </Text>

            <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 4 }}>
              Piece description (optional)
            </Text>
            <TextInput
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder="e.g. Ring — OV 3ct in 18k WG for J. Smith"
              placeholderTextColor="#555"
              style={{
                borderWidth: 1, borderColor: theme.border, borderRadius: 6,
                padding: 10, color: theme.textPrimary, marginBottom: spacing.md,
              }}
            />

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm }}>
              <TouchableOpacity
                onPress={() => setShowNewModal(false)}
                disabled={creating}
                style={{ paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Text style={{ color: theme.textMuted, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={createFreelance}
                disabled={creating}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6,
                  backgroundColor: theme.primary, opacity: creating ? 0.4 : 1,
                  flexDirection: "row", alignItems: "center",
                }}
              >
                {creating && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />}
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {creating ? "Creating…" : "Create dwj quote"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
