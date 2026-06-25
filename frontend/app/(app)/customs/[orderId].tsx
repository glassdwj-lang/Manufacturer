import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";

export default function CustomsScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user } = useAuth();
  const [airwayBill, setAirwayBill] = useState<string | null>(null);
  const [customsDoc, setCustomsDoc] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Customs and airway-bill data is admin-only. If a non-admin somehow lands
  // on this route (deep link, history, etc.) bounce them straight home —
  // they should never see this screen, not even as a "Failed" stub.
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/(app)");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const c = await api.getCustoms(orderId);
      setAirwayBill(c?.airway_bill ?? null);
      setCustomsDoc(c?.customs_document ?? null);
      setNotes(c?.notes ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const pickFile = async (which: "airway" | "customs") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Permission denied.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
    });
    if (!res.canceled && res.assets[0]?.base64) {
      const dataUri = `data:image/jpeg;base64,${res.assets[0].base64}`;
      if (which === "airway") setAirwayBill(dataUri);
      else setCustomsDoc(dataUri);
    }
  };

  const save = async () => {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateCustoms(orderId, {
        airway_bill: airwayBill,
        customs_document: customsDoc,
        notes,
      });
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.headerBar}>
          <TouchableOpacity testID="customs-close" onPress={safeBack} style={{ padding: 4 }}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.headerEyebrow}>CUSTOMS · CONFIDENTIAL</Text>
            <Text style={styles.headerTitle}>Atelier Documents</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <DocSlot
            label="AIRWAY BILL"
            uri={airwayBill}
            onUpload={() => pickFile("airway")}
            onClear={() => setAirwayBill(null)}
            testID="airway-bill"
          />
          <View style={{ height: spacing.lg }} />
          <DocSlot
            label="CUSTOMS DOCUMENT"
            uri={customsDoc}
            onUpload={() => pickFile("customs")}
            onClear={() => setCustomsDoc(null)}
            testID="customs-doc"
          />

          <Text style={styles.formLabel}>INTERNAL NOTES</Text>
          <TextInput
            testID="customs-notes-input"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Tracking number, declared value, route..."
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { height: 90 }]}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            testID="customs-save-button"
            onPress={save}
            disabled={saving}
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          >
            {saving ? <ActivityIndicator color="#0A0A0A" /> : <Text style={styles.primaryBtnText}>SAVE DOCUMENTS</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DocSlot({ label, uri, onUpload, onClear, testID }: {
  label: string; uri: string | null; onUpload: () => void; onClear: () => void; testID: string;
}) {
  return (
    <View>
      <View style={styles.docHeader}>
        <Text style={styles.formLabel}>{label}</Text>
        {uri && (
          <TouchableOpacity testID={`${testID}-clear`} onPress={onClear}>
            <Text style={styles.clearText}>REMOVE</Text>
          </TouchableOpacity>
        )}
      </View>
      {uri ? (
        <Image testID={`${testID}-preview`} source={{ uri }} style={styles.docPreview} resizeMode="cover" />
      ) : (
        <TouchableOpacity testID={`${testID}-upload`} onPress={onUpload} style={styles.docDrop}>
          <Ionicons name="cloud-upload-outline" size={28} color={theme.primary} />
          <Text style={styles.docDropText}>TAP TO UPLOAD</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerBar: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerEyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 3 },
  headerTitle: { color: theme.textPrimary, fontSize: 18, marginTop: 2 },
  formLabel: { color: theme.primary, fontSize: 10, letterSpacing: 3, marginTop: spacing.lg, marginBottom: spacing.sm },
  docHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  clearText: { color: theme.error, fontSize: 10, letterSpacing: 2 },
  docDrop: {
    height: 180, borderWidth: 1, borderStyle: "dashed", borderColor: theme.border,
    alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  docDropText: { color: theme.primary, fontSize: 11, letterSpacing: 3 },
  docPreview: { width: "100%", height: 220, borderWidth: 1, borderColor: theme.border },
  input: { color: theme.textPrimary, fontSize: 14, borderWidth: 1, borderColor: theme.border, padding: spacing.md, textAlignVertical: "top" },
  error: { color: theme.error, fontSize: 12, marginTop: spacing.md },
  primaryBtn: { backgroundColor: theme.primary, paddingVertical: 16, alignItems: "center", marginTop: spacing.xl },
  primaryBtnText: { color: "#0A0A0A", fontSize: 12, fontWeight: "700", letterSpacing: 3 },
});
