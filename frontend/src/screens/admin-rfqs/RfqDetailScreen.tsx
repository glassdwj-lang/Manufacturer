/**
 * RfqDetailScreen — admin views a single RFQ, sees existing
 * broadcasts (with serial numbers + expiry), can broadcast to
 * more manufacturers, extend a broadcast (+14 days, one-shot),
 * or import a responded broadcast into a Quote.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

export default function RfqDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const rfqId = String(params.id || "");
  const safeBack = useSafeBack("/(app)/admin/rfqs");
  const [rfq, setRfq] = useState<any | null>(null);
  const [mfrs, setMfrs] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([
        api.getRfq(rfqId),
        api.listManufacturers({ include_paused: false, include_burned: false }),
      ]);
      setRfq(r); setMfrs(m);
    } catch (e: any) { Alert.alert("Load failed", e?.message || "unknown"); }
  }, [rfqId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const broadcast = async () => {
    if (!selected.size) { Alert.alert("Pick manufacturers", "Select at least one workshop."); return; }
    // Skip mfrs already broadcasted to (avoid duplicate serials)
    const alreadyDirIds = new Set((rfq?.broadcasts || []).map((b: any) => b.manufacturer_directory_id).filter(Boolean));
    const toSend = [...selected].filter(id => !alreadyDirIds.has(id));
    if (!toSend.length) { Alert.alert("Already broadcast", "Every selected manufacturer already has a broadcast for this RFQ."); return; }
    setBusy(true);
    try {
      await api.broadcastRfq(rfqId, toSend);
      setSelected(new Set());
      await load();
      Alert.alert("Broadcast sent", `Allocated ${toSend.length} fresh serial number(s).`);
    } catch (e: any) { Alert.alert("Broadcast failed", e?.message || "unknown"); }
    finally { setBusy(false); }
  };

  const extend = async (broadcastId: string) => {
    try {
      await api.extendBroadcast(rfqId, broadcastId);
      await load();
      Alert.alert("Extended", "+14 days granted (one-shot).");
    } catch (e: any) { Alert.alert("Extension failed", e?.message || "unknown"); }
  };

  const importToQuote = async (broadcastId: string) => {
    try {
      const r = await api.importBroadcastToQuote(rfqId, broadcastId);
      Alert.alert("Quote created", `Draft quote ${r.quote_id.slice(0,8)}… seeded from broadcast.`);
      await load();
    } catch (e: any) { Alert.alert("Import failed", e?.message || "unknown"); }
  };

  if (!rfq) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
    </SafeAreaView>
  );

  const prefs = rfq.preference_snapshot || {};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top","bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="arrow-back" size={22} color={theme.textPrimary} /></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>
          {rfq.brand} · {rfq.piece_type_label}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40, maxWidth: 520, width: "100%", alignSelf: "center" }}>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{rfq.origin === "admin_bespoke" ? "Bespoke (this app)" : "gem-gallery-193"} · status: {rfq.status}</Text>
        <Text style={{ color: theme.textPrimary, fontWeight: "700", fontSize: 18, marginTop: 4 }}>{rfq.client_name || "Unnamed client"}</Text>

        <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 16, marginBottom: 4 }}>Preference</Text>
        <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: spacing.sm }}>
          {Object.entries({
            Name: prefs.name, Metal: prefs.metal_preference, Stone: prefs.main_stone_type,
            Shape: prefs.stone_shape, Carat: prefs.carat_weight, Size: prefs.ring_size,
            Budget: prefs.budget_min ? `${prefs.budget_min} – ${prefs.budget_max || "?"} ${prefs.budget_currency||""}` : undefined,
            Notes: prefs.other_ring_elements, Inscription: prefs.inscription_text,
          }).filter(([, v]) => v).map(([k, v]) => (
            <Text key={k} style={{ color: theme.textPrimary, fontSize: 13 }}><Text style={{ color: theme.textMuted }}>{k}: </Text>{String(v)}</Text>
          ))}
        </View>

        <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 16 }}>Broadcasts ({rfq.broadcasts?.length || 0})</Text>
        {(rfq.broadcasts || []).map((b: any) => (
          <View key={b.id} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: spacing.sm, marginTop: 8 }}>
            <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 14 }}>{b.serial_display}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>engraved: {b.serial_engraved}</Text>
            <Text style={{ color: theme.textPrimary, fontSize: 13, marginTop: 4 }}>{b.manufacturer_name_internal}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>expires: {(b.expires_at||"").slice(0,10)}{b.extension_granted?" (+14)":""}</Text>
              <Text style={{ color: theme.textPrimary, fontSize: 11, fontWeight: "700" }}>{b.status}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {!b.extension_granted && b.status !== "responded" && (
                <TouchableOpacity onPress={() => extend(b.id)} style={{ flex: 1, padding: 8, backgroundColor: "#7A5A15", borderRadius: 4, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>+14 days</Text>
                </TouchableOpacity>
              )}
              {b.status === "responded" && (
                <TouchableOpacity onPress={() => importToQuote(b.id)} style={{ flex: 1, padding: 8, backgroundColor: theme.primary, borderRadius: 4, alignItems: "center" }}>
                  <Text style={{ color: "#000", fontSize: 12, fontWeight: "700" }}>Import to Quote</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 20 }}>Broadcast to more</Text>
        <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 6 }}>Each selected workshop gets its own fresh serial.</Text>
        {mfrs.map(m => {
          const already = (rfq.broadcasts || []).some((b: any) => b.manufacturer_directory_id === m.id);
          const sel = selected.has(m.id);
          return (
            <TouchableOpacity key={m.id} onPress={() => !already && toggle(m.id)}
              style={{ flexDirection: "row", alignItems: "center", padding: 8, borderWidth: 1, borderColor: sel ? theme.primary : theme.border, borderRadius: 6, marginTop: 4, opacity: already ? 0.35 : 1 }}>
              <Ionicons name={sel ? "checkbox" : "square-outline"} size={16} color={sel ? theme.primary : theme.textMuted} />
              <Text style={{ color: theme.primary, fontWeight: "700", marginLeft: 8, width: 30 }}>{m.code_display}</Text>
              <Text style={{ color: theme.textPrimary, flex: 1 }}>{m.name}</Text>
              {already && <Text style={{ color: theme.textMuted, fontSize: 10 }}>broadcast ✓</Text>}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity disabled={busy || !selected.size} onPress={broadcast}
          style={{ backgroundColor: !selected.size ? "#333" : theme.primary, padding: 14, borderRadius: 8, marginTop: 20, alignItems: "center" }}>
          <Text style={{ color: "#000", fontWeight: "700" }}>{busy ? "Broadcasting…" : `Broadcast to ${selected.size} workshop(s)`}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
