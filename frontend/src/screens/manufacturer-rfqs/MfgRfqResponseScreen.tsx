/**
 * MfgRfqResponseScreen — manufacturer views their assigned RFQ,
 * sees the preference snapshot, and submits their pricing / spec
 * response for the broadcast (restricted set of fields).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

export default function MfgRfqResponseScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const rfqId = String(params.id || "");
  const safeBack = useSafeBack("/(app)/manufacturer/rfqs");
  const [rfq, setRfq] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    price_usd: "", metal: "", stone_kind: "lab_diamond",
    lab_diamond_size_ct: "", lab_diamond_color: "", lab_diamond_clarity: "",
    piece_weight_g: "", lead_time_days: "", notes: "",
  });

  const load = useCallback(async () => {
    try { setRfq(await api.mfgGetRfq(rfqId)); }
    catch (e: any) { Alert.alert("Load failed", e?.message || "unknown"); }
  }, [rfqId]);

  useEffect(() => { load(); }, [load]);

  const bc = rfq?.broadcasts?.[0];

  const submit = async () => {
    if (!form.price_usd.trim()) { Alert.alert("Missing", "Price (USD) is required."); return; }
    setSaving(true);
    try {
      await api.recordBroadcastResponse(rfqId, bc.id, {
        price_usd: Number(form.price_usd),
        metal: form.metal || undefined,
        stone_kind: form.stone_kind || undefined,
        lab_diamond_size_ct: form.lab_diamond_size_ct ? Number(form.lab_diamond_size_ct) : undefined,
        lab_diamond_color: form.lab_diamond_color || undefined,
        lab_diamond_clarity: form.lab_diamond_clarity || undefined,
        piece_weight_g: form.piece_weight_g ? Number(form.piece_weight_g) : undefined,
        lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : undefined,
        notes: form.notes || undefined,
      });
      Alert.alert("Response recorded", "Thank you — the atelier has been notified.");
      await load();
    } catch (e: any) { Alert.alert("Submit failed", e?.message || "unknown"); }
    finally { setSaving(false); }
  };

  if (!rfq || !bc) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
    </SafeAreaView>
  );

  const prefs = rfq.preference_snapshot || {};
  const disabled = bc.status === "expired";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top","bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="arrow-back" size={22} color={theme.textPrimary} /></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>{bc.serial_display}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40, maxWidth: 520, width: "100%", alignSelf: "center" }}>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>engraved: {bc.serial_engraved}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>expires: {(bc.expires_at||"").slice(0,10)}{bc.extension_granted?" (+14 admin extension)":""} · status: {bc.status}</Text>

        <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 16, marginBottom: 4 }}>Preference</Text>
        <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: spacing.sm }}>
          {Object.entries({
            Piece: rfq.piece_type_label, Name: prefs.name,
            Metal: prefs.metal_preference, Stone: prefs.main_stone_type,
            Shape: prefs.stone_shape, Carat: prefs.carat_weight, Size: prefs.ring_size,
            Notes: prefs.other_ring_elements, Inscription: prefs.inscription_text,
          }).filter(([, v]) => v).map(([k, v]) => (
            <Text key={k} style={{ color: theme.textPrimary, fontSize: 13 }}><Text style={{ color: theme.textMuted }}>{k}: </Text>{String(v)}</Text>
          ))}
        </View>

        <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 16, marginBottom: 6 }}>Your response</Text>
        {disabled && <Text style={{ color: "#E06666", fontSize: 12, marginBottom: 6 }}>This broadcast has expired. Ask the atelier for a 14-day extension.</Text>}

        {([
          ["price_usd", "Price (USD) *", "decimal-pad"],
          ["metal", "Metal (eg 18k WG)", "default"],
          ["stone_kind", "Stone kind (lab_diamond | moissanite)", "default"],
          ["lab_diamond_size_ct", "LG diamond size (ct)", "decimal-pad"],
          ["lab_diamond_color", "LG diamond color", "default"],
          ["lab_diamond_clarity", "LG diamond clarity", "default"],
          ["piece_weight_g", "Piece weight (g)", "decimal-pad"],
          ["lead_time_days", "Lead time (days)", "decimal-pad"],
          ["notes", "Notes", "default"],
        ] as const).map(([k, label, kb]) => (
          <View key={k}>
            <Text style={{ color: theme.textPrimary, fontWeight: "600", marginTop: 10, marginBottom: 4 }}>{label}</Text>
            <TextInput
              editable={!disabled}
              value={(form as any)[k]}
              onChangeText={(v) => setForm(f => ({ ...f, [k]: v }))}
              keyboardType={kb as any}
              autoCapitalize="none"
              placeholderTextColor={theme.textMuted}
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, color: theme.textPrimary, opacity: disabled ? 0.5 : 1 }}
            />
          </View>
        ))}

        <TouchableOpacity disabled={saving || disabled} onPress={submit}
          style={{ backgroundColor: disabled ? "#333" : theme.primary, padding: 14, borderRadius: 8, marginTop: 20, alignItems: "center" }}>
          <Text style={{ color: "#000", fontWeight: "700" }}>{saving ? "Submitting…" : bc.status === "responded" ? "Update response" : "Submit response"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
