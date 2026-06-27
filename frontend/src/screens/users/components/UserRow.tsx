/**
 * Single user row in the Users directory.
 *
 * Two shapes:
 *   - Vendor row (manufacturer / cad_renderer) shows the alias edit
 *     affordance + a primary-contact preview line.
 *   - Everyone else falls back to the simple name / email / role label.
 */
import React from "react";
import { Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { User } from "@/src/api/client";
import { theme, ROLE_LABELS } from "@/src/theme";
import { usersStyles as styles } from "../styles";

export function UserRow({
  user,
  isAdminMe,
  editingAliasId,
  aliasDraft,
  setAliasDraft,
  startEditAlias,
  saveAlias,
  onToggleAutoForward,
  onDelete,
}: {
  user: User;
  isAdminMe: boolean;
  editingAliasId: string | null;
  aliasDraft: string;
  setAliasDraft: (v: string) => void;
  startEditAlias: (u: User) => void;
  saveAlias: (u: User) => void;
  onToggleAutoForward: (u: User, v: boolean) => void;
  onDelete: (u: User) => void;
}) {
  const router = useRouter();
  const isVendor =
    user.role === "manufacturer" || user.role === "cad_renderer";
  const isEditingAlias = editingAliasId === user.id;

  // Primary contact preview (vendor rows only).
  const list = (user as any).contacts as
    | {
        id?: string;
        name?: string | null;
        company_title?: string | null;
      }[]
    | undefined;
  const primaryId = (user as any).primary_contact_id as
    | string
    | null
    | undefined;
  const primary = list
    ? list.find((c) => c.id === primaryId) ||
      list.find((c) => (c.name || "").trim()) ||
      null
    : null;
  const primaryName = primary && (primary.name || "").trim();
  const primarySubtitle =
    primaryName && primary?.company_title
      ? `${primary.name}  \u00b7  ${primary.company_title}`
      : primaryName
        ? (primary?.name as string)
        : null;

  return (
    <View testID={`user-row-${user.id}`} style={styles.userRow}>
      <View style={{ flex: 1 }}>
        {isVendor ? (
          <>
            <Text style={styles.userName}>{user.name}</Text>
            {isEditingAlias ? (
              <TextInput
                testID={`alias-input-${user.id}`}
                value={aliasDraft}
                onChangeText={setAliasDraft}
                autoFocus
                onBlur={() => saveAlias(user)}
                onSubmitEditing={() => saveAlias(user)}
                placeholder="Somnio.Co Atelier Workshop N"
                placeholderTextColor={theme.textMuted}
                style={styles.aliasInput}
              />
            ) : (
              <TouchableOpacity
                testID={`alias-edit-${user.id}`}
                onPress={() => startEditAlias(user)}
                activeOpacity={0.7}
                style={{ marginTop: 2 }}
              >
                <View style={styles.aliasRow}>
                  <Text style={styles.aliasLabel}>Alias \u00b7 </Text>
                  <Text style={styles.aliasValue}>{user.alias || "\u2014"}</Text>
                  <Ionicons
                    name="pencil-outline"
                    size={12}
                    color={theme.textMuted}
                  />
                </View>
              </TouchableOpacity>
            )}
            <Text style={styles.userEmail}>{user.email}</Text>
            {primarySubtitle && (
              <View style={styles.contactRow}>
                <Ionicons
                  name="person-outline"
                  size={11}
                  color={theme.textMuted}
                />
                <Text style={styles.contactText} numberOfLines={1}>
                  {primarySubtitle}
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            <Text style={styles.userMeta}>
              {ROLE_LABELS[user.role] || user.role}
            </Text>
          </>
        )}
      </View>

      {user.role === "client" && isAdminMe && (
        <View style={styles.autoFwdBox}>
          <Text style={styles.autoFwdLabel}>AUTO FWD</Text>
          <Switch
            testID={`auto-forward-${user.id}`}
            value={!!user.auto_forward}
            onValueChange={(v) => onToggleAutoForward(user, v)}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor="#0A0A0A"
          />
        </View>
      )}

      {isAdminMe &&
        (user.role === "client" ||
          user.role === "manufacturer" ||
          user.role === "cad_renderer") && (
          <View style={styles.actionsCol}>
            <TouchableOpacity
              testID={`edit-user-${user.id}`}
              onPress={() =>
                router.push(`/(app)/create-user?userId=${user.id}`)
              }
              style={styles.actionBtn}
            >
              <Ionicons name="create-outline" size={18} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID={`delete-user-${user.id}`}
              onPress={() => onDelete(user)}
              style={styles.actionBtn}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={theme.error || "#C8553D"}
              />
            </TouchableOpacity>
          </View>
        )}
    </View>
  );
}

export default UserRow;
