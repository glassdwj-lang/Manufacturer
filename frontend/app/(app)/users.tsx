import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Switch, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, User } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing, ROLE_LABELS } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { confirmAction, notify } from "@/src/utils/confirm";

const ROLE_FILTERS: { key: string; label: string }[] = [
  { key: "manufacturer", label: "WORKSHOPS" },
  { key: "associate", label: "ASSOCIATES" },
  { key: "client", label: "CLIENTS" },
  { key: "admin", label: "ATELIER" },
];

export default function UsersScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState("manufacturer");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  // "Only show workshops missing a primary contact" filter. A workshop counts
  // as incomplete when none of its 3 contact slots have a name filled in.
  const [onlyMissingContacts, setOnlyMissingContacts] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.listUsers();
      setUsers(list);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  /** A manufacturer is "missing contacts" when no slot has a name filled in.
   * (Empty 3-slot rosters are auto-seeded by the backend, so a brand new
   * workshop also counts as missing — which is exactly what we want to surface.) */
  const isMissingContacts = (u: User): boolean => {
    if (u.role !== "manufacturer") return false;
    const list = (u as any).contacts as { name?: string | null }[] | undefined;
    if (!list || list.length === 0) return true;
    return !list.some((c) => (c.name || "").trim().length > 0);
  };

  const filteredRaw = users.filter((u) => u.role === filter);
  const filtered =
    filter === "manufacturer" && onlyMissingContacts
      ? filteredRaw.filter(isMissingContacts)
      : filteredRaw;
  const missingCount =
    filter === "manufacturer"
      ? filteredRaw.filter(isMissingContacts).length
      : 0;

  const handleToggleAutoForward = async (u: User, val: boolean) => {
    try {
      await api.setAutoForward(u.id, val);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, auto_forward: val } : x)));
    } catch (e) {
      console.warn(e);
    }
  };

  const startEditAlias = (u: User) => {
    setEditingAliasId(u.id);
    setAliasDraft(u.alias || "");
  };

  const saveAlias = async (u: User) => {
    const next = aliasDraft.trim();
    if (!next || next === u.alias) {
      setEditingAliasId(null);
      return;
    }
    try {
      await api.setAlias(u.id, next);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, alias: next } : x)));
    } catch (e) {
      console.warn(e);
    } finally {
      setEditingAliasId(null);
    }
  };

  const handleDeleteUser = (u: User) => {
    const label =
      u.role === "manufacturer"
        ? `workshop ${u.alias || u.name}`
        : `${ROLE_LABELS[u.role]?.toLowerCase() || u.role} ${u.name}`;
    confirmAction({
      title: "Delete user?",
      message:
        `This will permanently remove ${label} (${u.email}).\n\n` +
        "Users attached to active orders must have those orders moved to the recycle bin first.",
      confirmLabel: "DELETE",
      destructive: true,
      onConfirm: async () => {
        try {
          await api.deleteUser(u.id);
          setUsers((prev) => prev.filter((x) => x.id !== u.id));
          notify("User deleted", `${u.name} has been removed.`);
        } catch (e: any) {
          notify("Delete failed", e?.message ?? "Unable to delete user.");
        }
      },
    });
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
      <View style={styles.header}>
        <TouchableOpacity testID="users-back" onPress={safeBack} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DIRECTORY</Text>
          <Text style={styles.title}>Manufacturers · Users</Text>
        </View>
        <TouchableOpacity
          testID="add-user-button"
          onPress={() => router.push(`/(app)/create-user?role=${filter}`)}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={18} color="#0A0A0A" />
        </TouchableOpacity>
      </View>

      {/* Filter chips (single horizontal scroller, never wraps) */}
      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {ROLE_FILTERS.map((f) => {
            const isSel = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                testID={`filter-chip-${f.key}`}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, isSel && styles.chipSel]}
              >
                <Text style={[styles.chipText, isSel && styles.chipTextSel]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Sub-filter strip — only relevant while the Workshops tab is active */}
      {filter === "manufacturer" && (
        <View style={styles.subFilterRow}>
          <TouchableOpacity
            testID="filter-missing-contacts"
            onPress={() => setOnlyMissingContacts((v) => !v)}
            style={[
              styles.missingChip,
              onlyMissingContacts && styles.missingChipSel,
            ]}
          >
            <Ionicons
              name={onlyMissingContacts ? "alert-circle" : "alert-circle-outline"}
              size={14}
              color={onlyMissingContacts ? "#0A0A0A" : theme.primary}
            />
            <Text
              style={[
                styles.missingChipText,
                onlyMissingContacts && styles.missingChipTextSel,
              ]}
            >
              MISSING CONTACTS
            </Text>
            {missingCount > 0 && (
              <View
                style={[
                  styles.missingBadge,
                  onlyMissingContacts && styles.missingBadgeSel,
                ]}
              >
                <Text
                  style={[
                    styles.missingBadgeText,
                    onlyMissingContacts && styles.missingBadgeTextSel,
                  ]}
                >
                  {missingCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {onlyMissingContacts && (
            <Text style={styles.subFilterHint}>
              Showing workshops with no contact filled.
            </Text>
          )}
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No {ROLE_LABELS[filter] || filter}s yet.</Text>
            <TouchableOpacity
              testID="empty-add-user"
              style={styles.addPill}
              onPress={() => router.push(`/(app)/create-user?role=${filter}`)}
            >
              <Text style={styles.addPillText}>ADD {ROLE_LABELS[filter]?.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filtered.map((u) => (
            <View key={u.id} testID={`user-row-${u.id}`} style={styles.userRow}>
              <View style={{ flex: 1 }}>
                {u.role === "manufacturer" ? (
                  <>
                    <Text style={styles.userName}>{u.name}</Text>
                    {editingAliasId === u.id ? (
                      <TextInput
                        testID={`alias-input-${u.id}`}
                        value={aliasDraft}
                        onChangeText={setAliasDraft}
                        autoFocus
                        onBlur={() => saveAlias(u)}
                        onSubmitEditing={() => saveAlias(u)}
                        placeholder="Somnio.Co Atelier Workshop N"
                        placeholderTextColor={theme.textMuted}
                        style={styles.aliasInput}
                      />
                    ) : (
                      <TouchableOpacity
                        testID={`alias-edit-${u.id}`}
                        onPress={() => startEditAlias(u)}
                        activeOpacity={0.7}
                        style={{ marginTop: 2 }}
                      >
                        <View style={styles.aliasRow}>
                          <Text style={styles.aliasLabel}>Alias · </Text>
                          <Text style={styles.aliasValue}>{u.alias || "—"}</Text>
                          <Ionicons name="pencil-outline" size={12} color={theme.textMuted} />
                        </View>
                      </TouchableOpacity>
                    )}
                    <Text style={styles.userEmail}>{u.email}</Text>
                    {(() => {
                      // Surface the primary contact (name + title) right under
                      // the workshop email so admins can see *who* to call
                      // without opening the edit screen. Falls back to the
                      // first contact with a name if no primary is flagged.
                      const list = (u as any).contacts as
                        | {
                            id?: string;
                            name?: string | null;
                            company_title?: string | null;
                          }[]
                        | undefined;
                      if (!list || list.length === 0) return null;
                      const primaryId = (u as any).primary_contact_id as
                        | string
                        | null
                        | undefined;
                      const primary =
                        list.find((c) => c.id === primaryId) ||
                        list.find((c) => (c.name || "").trim()) ||
                        null;
                      if (!primary || !(primary.name || "").trim()) return null;
                      const subtitle = primary.company_title
                        ? `${primary.name}  ·  ${primary.company_title}`
                        : primary.name;
                      return (
                        <View style={styles.contactRow}>
                          <Ionicons
                            name="person-outline"
                            size={11}
                            color={theme.textMuted}
                          />
                          <Text style={styles.contactText} numberOfLines={1}>
                            {subtitle}
                          </Text>
                        </View>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <Text style={styles.userName}>{u.name}</Text>
                    <Text style={styles.userEmail}>{u.email}</Text>
                    <Text style={styles.userMeta}>{ROLE_LABELS[u.role] || u.role}</Text>
                  </>
                )}
              </View>
              {u.role === "client" && me?.role === "admin" && (
                <View style={styles.autoFwdBox}>
                  <Text style={styles.autoFwdLabel}>AUTO FWD</Text>
                  <Switch
                    testID={`auto-forward-${u.id}`}
                    value={!!u.auto_forward}
                    onValueChange={(v) => handleToggleAutoForward(u, v)}
                    trackColor={{ false: theme.border, true: theme.primary }}
                    thumbColor="#0A0A0A"
                  />
                </View>
              )}
              {me?.role === "admin" && (u.role === "client" || u.role === "manufacturer") && (
                <View style={styles.actionsCol}>
                  <TouchableOpacity
                    testID={`edit-user-${u.id}`}
                    onPress={() => router.push(`/(app)/create-user?userId=${u.id}`)}
                    style={styles.actionBtn}
                  >
                    <Ionicons name="create-outline" size={18} color={theme.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`delete-user-${u.id}`}
                    onPress={() => handleDeleteUser(u)}
                    style={styles.actionBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.error || "#C8553D"} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border, gap: spacing.sm },
  eyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  title: { color: theme.textPrimary, fontSize: 18, marginTop: 2 },
  addBtn: { backgroundColor: theme.primary, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  chipsWrap: { height: 56, borderBottomWidth: 1, borderBottomColor: theme.borderSubtle },
  chipsRow: { paddingHorizontal: spacing.lg, alignItems: "center", gap: spacing.sm },
  chip: {
    height: 36, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: theme.border,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  chipSel: { borderColor: theme.primary },
  chipText: { color: theme.textSecondary, fontSize: 10, letterSpacing: 2 },
  chipTextSel: { color: theme.primary },
  empty: { padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  emptyText: { color: theme.textSecondary, fontSize: 13, marginBottom: spacing.md },
  addPill: { borderWidth: 1, borderColor: theme.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  addPillText: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  userRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md, borderWidth: 1, borderColor: theme.border, marginBottom: spacing.sm,
  },
  userName: { color: theme.textPrimary, fontSize: 14 },
  realName: { color: theme.textSecondary, fontSize: 11, marginTop: 2, fontStyle: "italic" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  contactText: { color: theme.textSecondary, fontSize: 11, flexShrink: 1 },
  subFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  missingChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  missingChipSel: { backgroundColor: theme.primary },
  missingChipText: {
    color: theme.primary,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "600",
  },
  missingChipTextSel: { color: "#0A0A0A" },
  missingBadge: {
    backgroundColor: theme.primary,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  missingBadgeSel: { backgroundColor: "#0A0A0A" },
  missingBadgeText: { color: "#0A0A0A", fontSize: 10, fontWeight: "700" },
  missingBadgeTextSel: { color: theme.primary },
  subFilterHint: {
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    fontStyle: "italic",
  },
  aliasRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  aliasLabel: { color: theme.textMuted, fontSize: 11, letterSpacing: 1 },
  aliasValue: { color: theme.primary, fontSize: 12, letterSpacing: 1, marginRight: 4 },
  aliasInput: {
    color: theme.primary, fontSize: 14,
    borderBottomWidth: 1, borderBottomColor: theme.primary,
    paddingVertical: 2, paddingHorizontal: 0,
  },
  userEmail: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  userMeta: { color: theme.primary, fontSize: 10, letterSpacing: 2, marginTop: 4 },
  autoFwdBox: { alignItems: "center", gap: 4, marginLeft: spacing.md },
  autoFwdLabel: { color: theme.primary, fontSize: 9, letterSpacing: 1 },
  actionsCol: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
    gap: 6,
  },
  actionBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
});
