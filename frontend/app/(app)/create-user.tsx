import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Role, User } from "@/src/api/client";
import { theme, spacing, ROLE_LABELS } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";

const ROLE_OPTIONS: Role[] = ["manufacturer", "client"];

export default function CreateUserScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { role: initialRole } = useLocalSearchParams<{ role?: string }>();
  const [role, setRole] = useState<Role>((initialRole as Role) || "manufacturer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [associates, setAssociates] = useState<User[]>([]);
  const [selectedAssociate, setSelectedAssociate] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listUsers("associate");
        setAssociates(list);
      } catch {}
    })();
  }, []);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Name, email and password are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        associate_id: role === "client" ? selectedAssociate?.id ?? null : null,
      });
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity testID="create-user-close" onPress={safeBack}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerEyebrow}>NEW USER</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.formLabel}>ROLE</Text>
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((r) => {
              const isSel = role === r;
              return (
                <TouchableOpacity
                  key={r}
                  testID={`role-chip-${r}`}
                  onPress={() => setRole(r)}
                  style={[styles.roleChip, isSel && styles.roleChipSel]}
                >
                  <Text style={[styles.roleChipText, isSel && styles.roleChipTextSel]}>
                    {ROLE_LABELS[r]?.toUpperCase() || r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.formLabel}>FULL NAME</Text>
          <TextInput
            testID="user-name-input"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Master Liu Yang"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />

          <Text style={styles.formLabel}>EMAIL</Text>
          <TextInput
            testID="user-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="name@maison.com"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />

          <Text style={styles.formLabel}>TEMPORARY PASSWORD</Text>
          <TextInput
            testID="user-password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="Min 6 characters"
            placeholderTextColor={theme.textMuted}
            secureTextEntry
            style={styles.input}
          />

          {role === "client" && associates.length > 0 && (
            <>
              <Text style={styles.formLabel}>ASSIGNED ASSOCIATE</Text>
              <View style={styles.selectorBox}>
                {associates.map((a) => {
                  const isSel = selectedAssociate?.id === a.id;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      testID={`assoc-${a.id}`}
                      onPress={() => setSelectedAssociate(a)}
                      style={[styles.selectorRow, isSel && styles.selectorRowSel]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.selectorName, isSel && { color: theme.primary }]}>{a.name}</Text>
                        <Text style={styles.selectorEmail}>{a.email}</Text>
                      </View>
                      {isSel && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            testID="create-user-submit"
            onPress={submit}
            disabled={saving}
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          >
            {saving ? <ActivityIndicator color="#0A0A0A" /> : <Text style={styles.primaryBtnText}>CREATE USER</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerEyebrow: { color: theme.primary, fontSize: 11, letterSpacing: 3 },
  formLabel: { color: theme.primary, fontSize: 10, letterSpacing: 3, marginTop: spacing.lg, marginBottom: spacing.sm },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  roleChip: { borderWidth: 1, borderColor: theme.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  roleChipSel: { borderColor: theme.primary, backgroundColor: "rgba(212,175,55,0.08)" },
  roleChipText: { color: theme.textSecondary, fontSize: 10, letterSpacing: 2 },
  roleChipTextSel: { color: theme.primary },
  input: { color: theme.textPrimary, fontSize: 14, borderWidth: 1, borderColor: theme.border, padding: spacing.md },
  selectorBox: { borderWidth: 1, borderColor: theme.border },
  selectorRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.borderSubtle },
  selectorRowSel: { backgroundColor: "rgba(212,175,55,0.08)" },
  selectorName: { color: theme.textPrimary, fontSize: 14 },
  selectorEmail: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  error: { color: theme.error, fontSize: 12, marginTop: spacing.md },
  primaryBtn: { backgroundColor: theme.primary, paddingVertical: 16, alignItems: "center", marginTop: spacing.xl },
  primaryBtnText: { color: "#0A0A0A", fontSize: 12, fontWeight: "700", letterSpacing: 3 },
});
