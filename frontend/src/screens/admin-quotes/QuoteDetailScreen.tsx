/**
 * QuoteDetailScreen — view/edit a single quote. Every numeric input
 * lets admin adjust; on blur the backend recomputes `totals` and
 * echoes them back. Status transitions (draft → ready → sent) via
 * the header pill.
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

const NUMERIC_FIELDS: [string, string][] = [
  ["ring_cost_usd", "Ring cost (USD)"],
  ["hidden_halo_pave_cost_usd", "Hidden halo pâve (USD)"],
  ["extra_cut_cost_usd", "Extra cut (USD)"],
  ["cad_rendering_cost_usd", "CAD rendering (USD)"],
  ["provenance_cost_usd", "Provenance (USD)"],
  ["certification_cost_usd", "Certification (USD)"],
  ["box_packaging_cost_usd", "Box & packaging (USD)"],
  ["air_freight_cost_usd", "Air freight (USD)"],
  ["usd_to_aud_rate", "USD → AUD rate"],
  ["custom_clearance_aud", "Customs clearance (AUD)"],
  ["australian_delivery_aud", "AU delivery (AUD)"],
  ["intl_transaction_fees_aud", "Intl txn fees (AUD)"],
  ["duty_or_chafta_aud", "Duty / CHAFTA (AUD)"],
  ["markup_pct", "Markup (%)"],
  ["gst_pct", "GST (%)"],
];

export default function QuoteDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const qid = String(params.id || "");
  const safeBack = useSafeBack("/(app)/admin/quotes");
  const [quote, setQuote] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setQuote(await api.getQuote(qid)); }
    catch (e: any) { Alert.alert("Load failed", e?.message || "unknown"); }
  }, [qid]);

  useEffect(() => { load(); }, [load]);

  const savePatch = async (inputsOrStatus: any) => {
    setSaving(true);
    try { setQuote(await api.patchQuote(qid, inputsOrStatus)); }
    catch (e: any) { Alert.alert("Save failed", e?.message || "unknown"); }
    finally { setSaving(false); }
  };

  const setInput = (k: string, v: string) => {
    setQuote((q: any) => ({ ...q, inputs: { ...q.inputs, [k]: v === "" ? 0 : Number(v) } }));
  };

  const commitInputs = () => quote && savePatch({ inputs: quote.inputs });

  const setStatus = (s: string) => savePatch({ status: s });

  if (!quote) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
    </SafeAreaView>
  );

  const t = quote.totals || {};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top","bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="arrow-back" size={22} color={theme.textPrimary} /></TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>Quote</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
        {quote.serial_display && (
          <View style={{ backgroundColor: "#1a1a1a", padding: 10, borderRadius: 8, marginBottom: 12 }}>
            <Text style={{ color: theme.primary, fontWeight: "700" }}>{quote.serial_display}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>engraved: {quote.serial_engraved} · RFQ {quote.rfq_id?.slice(0,8)}…</Text>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: 12 }}>
          {["draft", "ready", "sent"].map((s) => (
            <TouchableOpacity key={s} onPress={() => setStatus(s)}
              style={{ flex: 1, padding: 8, borderRadius: 6,
                backgroundColor: quote.status === s ? theme.primary : "transparent",
                borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: quote.status === s ? "#000" : theme.textPrimary, textAlign: "center", fontWeight: "700", fontSize: 12 }}>{s.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ color: theme.textPrimary, fontWeight: "700", marginTop: 8, marginBottom: 4 }}>Inputs</Text>
        {NUMERIC_FIELDS.map(([k, label]) => (
          <View key={k}>
            <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 8 }}>{label}</Text>
            <TextInput
              value={String(quote.inputs?.[k] ?? "")}
              onChangeText={(v) => setInput(k, v)}
              onBlur={commitInputs}
              keyboardType="decimal-pad"
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 6, padding: 8, color: theme.textPrimary }}
            />
          </View>
        ))}

        <View style={{ backgroundColor: "#0F1F1F", padding: 12, borderRadius: 8, marginTop: 16 }}>
          <Text style={{ color: theme.primary, fontWeight: "700", marginBottom: 6 }}>Totals</Text>
          {[
            ["Total USD", t.total_usd_costs, "USD"],
            ["Cost price AUD", t.cost_price_aud, "AUD"],
            ["Retail (ex-GST)", t.retail_sell_price_ex_gst_aud, "AUD"],
            ["Sell (inc-GST)", t.total_sell_price_inc_gst_aud, "AUD"],
            ["Margin AUD", t.margin_aud, "AUD"],
            ["Margin %", t.margin_pct, "%"],
          ].map(([label, val, unit]) => (
            <View key={label as string} style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 2 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>{label as string}</Text>
              <Text style={{ color: theme.textPrimary, fontWeight: "600", fontSize: 12 }}>
                {val != null ? `${unit === "%" ? "" : unit + " "}${Number(val).toFixed(2)}${unit === "%" ? "%" : ""}` : "—"}
              </Text>
            </View>
          ))}
        </View>

        {saving && <ActivityIndicator style={{ marginTop: 10 }} color={theme.primary} />}
      </ScrollView>
    </SafeAreaView>
  );
}
