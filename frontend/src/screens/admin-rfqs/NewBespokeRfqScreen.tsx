/**
 * NewBespokeRfqScreen — "Call up a preference" form for pieces not
 * in the gem-gallery lookbook / catalog. Admin fills the preference
 * snapshot and creates a fresh RFQ that lives entirely in Somnio.
 */
import React, { useState } from "react";
import {
  Alert, ScrollView, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

const PIECE_TYPES = [
  { id: 1, label: "Ring" }, { id: 2, label: "Pendant" },
  { id: 3, label: "Earrings" }, { id: 4, label: "Bracelet" },
  { id: 5, label: "Necklace" }, { id: 6, label: "Brooch" },
  { id: 7, label: "Cufflinks" }, { id: 8, label: "Other" },
];

export default function NewBespokeRfqScreen() {
  const router = useRouter();
  const safeBack = useSafeBack("/(app)/admin/rfqs");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_name: "", brand: "SB", piece_type: 1,
    name: "", metal_preference: "", main_stone_type: "",
    stone_shape: "", carat_weight: "", ring_size: "",
    budget_min: "", budget_max: "", budget_currency: "AUD",
    other_ring_elements: "", inscription_text: "",
    admin_notes: "",
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const rfq = await api.createBespokeRfq({
        client_name: form.client_name || undefined,
        brand: form.brand,
        piece_type: form.piece_type,
        preference_snapshot: {
          name: form.name || undefined,
          metal_preference: form.metal_preference || undefined,
          main_stone_type: form.main_stone_type || undefined,
          stone_shape: form.stone_shape || undefined,
          carat_weight: form.carat_weight || undefined,
          ring_size: form.ring_size || undefined,
          budget_min: form.budget_min ? Number(form.budget_min) : undefined,
          budget_max: form.budget_max ? Number(form.budget_max) : undefined,
          budget_currency: form.budget_currency || undefined,
          other_ring_elements: form.other_ring_elements || undefined,
          inscription_text: form.inscription_text || undefined,
        },
        admin_notes: form.admin_notes || undefined,
        submit_immediately: true,
      });
      router.replace(`/(app)/admin/rfqs/${rfq.id}`);
    } catch (e: any) {
      Alert.alert("Create failed", e?.message || "unknown");
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top","bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="close" size={22} color={theme.textPrimary} /></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>New Bespoke RFQ</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 60, maxWidth: 520, width: "100%", alignSelf: "center" }}>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
          For pieces not in the gem-gallery catalog. Serial numbers are allocated at broadcast time.
        </Text>

        <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 12, marginBottom: 4 }}>Piece type</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {PIECE_TYPES.map(pt => (
            <TouchableOpacity key={pt.id} onPress={() => set("piece_type", pt.id)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4,
                borderWidth: 1, borderColor: form.piece_type === pt.id ? theme.primary : theme.border,
                backgroundColor: form.piece_type === pt.id ? theme.primary : "transparent" }}>
              <Text style={{ color: form.piece_type === pt.id ? "#000" : theme.textPrimary, fontSize: 12 }}>{pt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {([
          ["brand", "Brand code (2 letters, default SB)", "characters"],
          ["client_name", "Client name", "words"],
          ["name", "Preference name (eg 'Men's signet')", "words"],
          ["metal_preference", "Metal preference (eg 18K WG)", "characters"],
          ["main_stone_type", "Main stone type (eg Diamond)", "words"],
          ["stone_shape", "Stone shape (RD, OV, EM…)", "characters"],
          ["carat_weight", "Carat weight", "none"],
          ["ring_size", "Ring size", "characters"],
          ["budget_min", "Budget min", "none"],
          ["budget_max", "Budget max", "none"],
          ["budget_currency", "Currency (AUD/USD/EUR)", "characters"],
          ["other_ring_elements", "Other elements / notes", "sentences"],
          ["inscription_text", "Inscription text", "sentences"],
          ["admin_notes", "Admin notes (internal)", "sentences"],
        ] as const).map(([k, label, cap]) => (
          <View key={k}>
            <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 12, marginBottom: 4 }}>{label}</Text>
            <TextInput
              value={(form as any)[k]}
              onChangeText={(v) => set(k, v)}
              autoCapitalize={cap as any}
              keyboardType={["budget_min","budget_max","carat_weight"].includes(k) ? "decimal-pad" : "default"}
              placeholderTextColor={theme.textMuted}
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, color: theme.textPrimary }}
            />
          </View>
        ))}

        <TouchableOpacity disabled={saving} onPress={submit}
          style={{ backgroundColor: theme.primary, padding: 14, borderRadius: 8, marginTop: 20, alignItems: "center" }}>
          <Text style={{ color: "#000", fontWeight: "700" }}>{saving ? "Creating…" : "Create RFQ (Pending Review)"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
