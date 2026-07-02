/**
 * CompetitorsScreen — admin management of the Market-Anchor scraper library.
 *
 * Presents the merged (library + DB overrides) list. Admin can:
 *   • Toggle each site active / paused
 *   • Edit the search URL (persists to db.competitor_sites)
 *   • Reset a site's overrides back to the hardcoded defaults
 *
 * All PATCHes upsert into ``competitor_sites`` — the library stays
 * as the source of truth for structural fields (name / strategy / id).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, RefreshControl,
  Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

type Site = {
  id: string; name: string;
  base_url: string; search_url: string;
  active: boolean; strategy?: string; feasibility?: string;
  notes?: string;
};

export default function CompetitorsScreen() {
  const safeBack = useSafeBack("/(app)");
  const [items, setItems] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.listCompetitorsAdmin());
    } catch (e: any) {
      Alert.alert("Load failed", e?.message || "unknown");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleActive = async (site: Site, value: boolean) => {
    // Optimistic UI — flip local state first, roll back on error.
    setItems(prev => prev.map(s => (s.id === site.id ? { ...s, active: value } : s)));
    try {
      await api.updateCompetitor(site.id, { active: value });
    } catch (e: any) {
      setItems(prev => prev.map(s => (s.id === site.id ? { ...s, active: !value } : s)));
      Alert.alert("Toggle failed", e?.message || "unknown");
    }
  };

  const saveUrl = async (site: Site) => {
    const trimmed = draftUrl.trim();
    if (!trimmed || trimmed === site.search_url) {
      setEditingId(null);
      return;
    }
    setSavingId(site.id);
    try {
      const updated = await api.updateCompetitor(site.id, { search_url: trimmed });
      setItems(prev => prev.map(s => (s.id === site.id ? updated : s)));
      setEditingId(null);
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "unknown");
    } finally {
      setSavingId(null);
    }
  };

  const resetSite = (site: Site) => {
    Alert.alert(
      "Reset overrides?",
      `Discard your edits on \"${site.name}\" and restore hardcoded defaults?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: async () => {
          try {
            const restored = await api.resetCompetitor(site.id);
            setItems(prev => prev.map(s => (s.id === site.id ? restored : s)));
          } catch (e: any) {
            Alert.alert("Reset failed", e?.message || "unknown");
          }
        }},
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>
          Competitor Library
        </Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={{ color: theme.textMuted, fontSize: 11, paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
        Toggle sites active / paused and update their search URLs. Paused sites are skipped in every Run/Refresh anchors call until re-enabled.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: spacing.md, maxWidth: 720, width: "100%", alignSelf: "center", paddingBottom: 60 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />}
          renderItem={({ item }) => (
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: "700", fontSize: 14 }}>{item.name}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                    {item.id} · {item.strategy}{item.feasibility ? ` · ${item.feasibility}` : ""}
                  </Text>
                </View>
                <Switch
                  value={!!item.active}
                  onValueChange={(v) => toggleActive(item, v)}
                  thumbColor={item.active ? theme.primary : "#666"}
                  trackColor={{ true: "#3A3A2A", false: "#333" }}
                />
              </View>

              {editingId === item.id ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                  <TextInput
                    value={draftUrl}
                    onChangeText={setDraftUrl}
                    placeholder={item.search_url}
                    placeholderTextColor="#555"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 6,
                      paddingHorizontal: 8, paddingVertical: 6, color: theme.textPrimary, fontSize: 11,
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => saveUrl(item)}
                    disabled={savingId === item.id}
                    style={{ marginLeft: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, backgroundColor: theme.primary }}
                  >
                    {savingId === item.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Save</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setEditingId(null)}
                    style={{ marginLeft: 4, paddingHorizontal: 8, paddingVertical: 6 }}
                  >
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => { setEditingId(item.id); setDraftUrl(item.search_url); }}
                  style={{ paddingVertical: 2 }}
                >
                  <Text style={{ color: theme.primary, fontSize: 11 }} numberOfLines={1}>
                    {item.search_url}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={{ flexDirection: "row", marginTop: 4 }}>
                <TouchableOpacity onPress={() => resetSite(item)} style={{ paddingVertical: 2 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }}>Reset to defaults</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
