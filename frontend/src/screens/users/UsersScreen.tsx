/**
 * UsersScreen — orchestrator for the directory.
 *
 * Was the 465-line `app/(app)/users.tsx` monolith. Decomposed into:
 *   - hooks/useUsersList.ts (state + IO + delete/alias/auto-fwd actions)
 *   - components/RoleFilterChips.tsx, MissingContactsFilter.tsx, UserRow.tsx
 *   - styles.ts, helpers.ts (shared)
 */
import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ROLE_LABELS, spacing, theme } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

import { usersStyles as styles } from "./styles";
import { useUsersList } from "./hooks/useUsersList";
import { RoleFilterChips } from "./components/RoleFilterChips";
import { MissingContactsFilter } from "./components/MissingContactsFilter";
import { UserRow } from "./components/UserRow";

export default function UsersScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user: me } = useAuth();
  const list = useUsersList();
  const isVendorTab =
    list.filter === "manufacturer" || list.filter === "cad_renderer";

  if (list.loading) {
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
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity
          testID="users-back"
          onPress={safeBack}
          style={{ padding: 4 }}
        >
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DIRECTORY</Text>
          <Text style={styles.title}>Manufacturers · Users</Text>
        </View>
        <TouchableOpacity
          testID="add-user-button"
          onPress={() =>
            router.push(`/(app)/create-user?role=${list.filter}`)
          }
          style={styles.addBtn}
        >
          <Ionicons name="add" size={18} color="#0A0A0A" />
        </TouchableOpacity>
      </View>

      <RoleFilterChips filter={list.filter} onChange={list.setFilter} />

      {isVendorTab && (
        <MissingContactsFilter
          active={list.onlyMissingContacts}
          count={list.missingCount}
          onToggle={() =>
            list.setOnlyMissingContacts(!list.onlyMissingContacts)
          }
        />
      )}

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={() => {
              list.setRefreshing(true);
              list.reload();
            }}
            tintColor={theme.primary}
          />
        }
      >
        {list.filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No {ROLE_LABELS[list.filter] || list.filter}s yet.
            </Text>
            <TouchableOpacity
              testID="empty-add-user"
              style={styles.addPill}
              onPress={() =>
                router.push(`/(app)/create-user?role=${list.filter}`)
              }
            >
              <Text style={styles.addPillText}>
                ADD {ROLE_LABELS[list.filter]?.toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          list.filtered.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isAdminMe={me?.role === "admin"}
              editingAliasId={list.editingAliasId}
              aliasDraft={list.aliasDraft}
              setAliasDraft={list.setAliasDraft}
              startEditAlias={list.startEditAlias}
              saveAlias={list.saveAlias}
              onToggleAutoForward={list.handleToggleAutoForward}
              onDelete={list.handleDeleteUser}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
