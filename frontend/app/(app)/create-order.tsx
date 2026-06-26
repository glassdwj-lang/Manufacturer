import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, User } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

export default function CreateOrderScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const [clients, setClients] = useState<User[]>([]);
  const [mfgs, setMfgs] = useState<User[]>([]);
  const [selectedClient, setSelectedClient] = useState<User | null>(null);
  const [selectedMfg, setSelectedMfg] = useState<User | null>(null);
  const [jewelryName, setJewelryName] = useState("");
  const [sku, setSku] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, m] = await Promise.all([api.listUsers("client"), api.listUsers("manufacturer")]);
        setClients(c);
        setMfgs(m);
      } catch (e: any) {
        setError(e?.message ?? "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submit = async () => {
    if (!selectedClient || !selectedMfg || !jewelryName.trim()) {
      setError("Client, workshop, and jewelry name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const order = await api.createOrder({
        client_id: selectedClient.id,
        manufacturer_id: selectedMfg.id,
        jewelry_name: jewelryName.trim(),
        sku: sku.trim(),
        description: desc.trim(),
      });
      router.replace(`/(app)/order/${order.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <BrandStrip />
      <View style={styles.headerBar}>
          <TouchableOpacity testID="create-order-close" onPress={safeBack}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerEyebrow}>NEW COMMISSION</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.formLabel}>JEWELRY NAME</Text>
          <TextInput
            testID="order-jewelry-name"
            value={jewelryName}
            onChangeText={setJewelryName}
            placeholder="e.g. Étoile Solitaire — 2ct Lab Diamond"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
          <Text style={styles.formLabel}>SKU</Text>
          <TextInput
            testID="order-sku"
            value={sku}
            onChangeText={setSku}
            placeholder="SOM-XXX-001"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            autoCapitalize="characters"
          />
          <Text style={styles.formLabel}>DESCRIPTION</Text>
          <TextInput
            testID="order-description"
            value={desc}
            onChangeText={setDesc}
            multiline
            placeholder="Brief description, customer notes..."
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { height: 80 }]}
          />

          <Selector
            label="CLIENT"
            items={clients}
            selected={selectedClient}
            onSelect={setSelectedClient}
            testID="select-client"
          />
          <Selector
            label="WORKSHOP / MANUFACTURER"
            items={mfgs}
            selected={selectedMfg}
            onSelect={setSelectedMfg}
            testID="select-manufacturer"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            testID="create-order-submit"
            onPress={submit}
            disabled={saving}
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          >
            {saving ? <ActivityIndicator color="#0A0A0A" /> : <Text style={styles.primaryBtnText}>CREATE COMMISSION</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Selector({ label, items, selected, onSelect, testID }: {
  label: string; items: User[]; selected: User | null; onSelect: (u: User) => void; testID: string;
}) {
  return (
    <>
      <Text style={styles.formLabel}>{label}</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyHint}>No {label.toLowerCase()} accounts yet — create one in Manufacturers / Users.</Text>
      ) : (
        <View style={styles.selectorBox}>
          {items.map((u) => {
            const isSel = selected?.id === u.id;
            return (
              <TouchableOpacity
                key={u.id}
                testID={`${testID}-${u.id}`}
                onPress={() => onSelect(u)}
                style={[styles.selectorRow, isSel && styles.selectorRowSel]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.selectorName, isSel && { color: theme.primary }]}>
                    {u.name}
                    {u.alias ? (
                      <Text style={styles.selectorAlias}>{`  (${u.alias})`}</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.selectorEmail}>{u.email}</Text>
                </View>
                {isSel && <Ionicons name="checkmark" size={18} color={theme.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerEyebrow: { color: theme.primary, fontSize: 11, letterSpacing: 3 },
  formLabel: { color: theme.primary, fontSize: 10, letterSpacing: 3, marginTop: spacing.lg, marginBottom: spacing.sm },
  input: { color: theme.textPrimary, fontSize: 14, borderWidth: 1, borderColor: theme.border, padding: spacing.md, textAlignVertical: "top" },
  emptyHint: { color: theme.textSecondary, fontSize: 12, fontStyle: "italic" },
  selectorBox: { borderWidth: 1, borderColor: theme.border },
  selectorRow: {
    flexDirection: "row", alignItems: "center", padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: theme.borderSubtle,
  },
  selectorRowSel: { backgroundColor: "rgba(212,175,55,0.08)" },
  selectorName: { color: theme.textPrimary, fontSize: 14 },
  selectorAlias: { color: theme.primary, fontSize: 12, fontStyle: "italic" },
  selectorEmail: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  error: { color: theme.error, fontSize: 12, marginTop: spacing.md },
  primaryBtn: { backgroundColor: theme.primary, paddingVertical: 16, alignItems: "center", marginTop: spacing.xl },
  primaryBtnText: { color: "#0A0A0A", fontSize: 12, fontWeight: "700", letterSpacing: 3 },
});
