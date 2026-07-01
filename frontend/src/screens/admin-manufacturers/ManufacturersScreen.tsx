/**
 * ManufacturersScreen — Admin CRUD for the canonical manufacturer
 * directory. Somnio owns; every mutation is pushed to gem-gallery-193
 * by the backend so both apps stay aligned.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

export default function ManufacturersScreen() {
  const safeBack = useSafeBack("/(app)");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", contact_email: "", contact_name: "", contact_phone: "",
    country: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.listManufacturers()); } catch (e: any) {
      Alert.alert("Load failed", e?.message || "unknown");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name.trim() || !form.contact_email.trim()) {
      Alert.alert("Missing fields", "Name and contact email are required.");
      return;
    }
    setSaving(true);
    try {
      await api.createManufacturer({
        name: form.name.trim(),
        contact_email: form.contact_email.trim(),
        contact_name: form.contact_name.trim() || undefined,
        contact_phone: form.contact_phone.trim() || undefined,
        country: form.country.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setShowForm(false);
      setForm({ name: "", contact_email: "", contact_name: "", contact_phone: "", country: "", notes: "" });
      await load();
    } catch (e: any) {
      Alert.alert("Create failed", e?.message || "unknown");
    } finally { setSaving(false); }
  };

  const changeStatus = async (id: string, current: string) => {
    const options: { label: string; value: "active"|"paused"|"burned" }[] = [];
    if (current !== "active" && current !== "burned") options.push({ label: "Activate", value: "active" });
    if (current !== "paused" && current !== "burned") options.push({ label: "Pause", value: "paused" });
    if (current !== "burned") options.push({ label: "Burn (permanent)", value: "burned" });
    if (!options.length) { Alert.alert("Burned", "Terminal state — cannot change."); return; }
    Alert.alert("Change status", `Currently: ${current}`, [
      { text: "Cancel", style: "cancel" },
      ...options.map(o => ({
        text: o.label,
        style: o.value === "burned" ? ("destructive" as const) : ("default" as const),
        onPress: async () => {
          try { await api.changeManufacturerStatus(id, o.value); await load(); }
          catch (e: any) { Alert.alert("Status change failed", e?.message || "unknown"); }
        },
      })),
    ]);
  };

  const bootstrap = async () => {
    Alert.alert("Bootstrap directory", "Adopt gem-gallery mfrs & push Somnio-only mfrs. Proceed?", [
      { text: "Cancel", style: "cancel" },
      { text: "Run", onPress: async () => {
        try { const r = await api.bootstrapManufacturers();
          Alert.alert("Bootstrap complete",
            `Adopted: ${r.adopted_from_gem_gallery?.length ?? 0}\nPushed: ${r.pushed_to_gem_gallery?.length ?? 0}\nSkipped: ${r.skipped?.length ?? 0}`);
          await load();
        } catch (e: any) { Alert.alert("Bootstrap failed", e?.message || "unknown"); }
      }},
    ]);
  };

  const syncPending = async () => {
    try { const r = await api.syncPendingManufacturers();
      Alert.alert("Retry complete", `${r.retried} record(s) retried.`);
      await load();
    } catch (e: any) { Alert.alert("Retry failed", e?.message || "unknown"); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top","bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="arrow-back" size={22} color={theme.textPrimary} /></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>Manufacturers</Text>
        <TouchableOpacity onPress={() => setShowForm(v => !v)}>
          <Ionicons name={showForm ? "close" : "add"} size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-around", paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
        <TouchableOpacity onPress={bootstrap} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="sync" size={14} color={theme.primary} />
          <Text style={{ color: theme.primary, fontSize: 12 }}>Bootstrap</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={syncPending} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="refresh" size={14} color={theme.primary} />
          <Text style={{ color: theme.primary, fontSize: 12 }}>Retry pending</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <ScrollView style={{ maxHeight: 340, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          {([
            ["name", "Workshop name *"],
            ["contact_email", "Contact email *"],
            ["contact_name", "Contact person"],
            ["contact_phone", "Contact phone"],
            ["country", "Country (ISO-2)"],
            ["notes", "Notes"],
          ] as const).map(([k, label]) => (
            <TextInput
              key={k}
              placeholder={label}
              placeholderTextColor={theme.textMuted}
              value={(form as any)[k]}
              onChangeText={(v) => setForm(f => ({ ...f, [k]: v }))}
              autoCapitalize={k === "contact_email" ? "none" : "words"}
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, marginVertical: 4, color: theme.textPrimary }}
            />
          ))}
          <TouchableOpacity disabled={saving} onPress={submit} style={{ backgroundColor: theme.primary, padding: 12, borderRadius: 8, marginVertical: spacing.sm, alignItems: "center" }}>
            <Text style={{ color: "#000", fontWeight: "700" }}>{saving ? "Saving…" : "Save & push to gem-gallery"}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: spacing.md, maxWidth: 520, width: "100%", alignSelf: "center" }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => changeStatus(item.id, item.status)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={{ color: theme.primary, fontWeight: "700", width: 30 }}>{item.code_display}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>{item.name}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>{item.contact_email}</Text>
                </View>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
                  backgroundColor:
                    item.status === "active" ? "#164E3B" :
                    item.status === "paused" ? "#7A5A15" : "#7A1F1F",
                }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>{item.status}</Text>
                </View>
                {item.pending_sync && <Ionicons name="warning" size={14} color="#E0A020" />}
              </View>
              {item.last_sync_error && (
                <Text style={{ color: "#E0A020", fontSize: 11, marginTop: 4, marginLeft: 38 }} numberOfLines={2}>
                  {item.last_sync_error}
                </Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: theme.textMuted, marginTop: 20 }}>No manufacturers yet — run Bootstrap.</Text>}
        />
      )}
    </SafeAreaView>
  );
}
