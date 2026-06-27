/**
 * useUsersList — owns the directory's load lifecycle, the role filter,
 * inline alias editing, client auto-forward switching, and the destructive
 * delete confirmation.
 */
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api, User } from "@/src/api/client";
import { ROLE_LABELS } from "@/src/theme";
import { confirmAction, notify } from "@/src/utils/confirm";
import { isMissingContacts } from "../helpers";

export function useUsersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState("manufacturer");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  // "Only show workshops missing a primary contact" filter.
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    load();
  }, [load]);

  const filteredRaw = users.filter((u) => u.role === filter);
  const filtered =
    (filter === "manufacturer" || filter === "cad_renderer") && onlyMissingContacts
      ? filteredRaw.filter(isMissingContacts)
      : filteredRaw;
  const missingCount =
    filter === "manufacturer" || filter === "cad_renderer"
      ? filteredRaw.filter(isMissingContacts).length
      : 0;

  const handleToggleAutoForward = async (u: User, val: boolean) => {
    try {
      await api.setAutoForward(u.id, val);
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, auto_forward: val } : x)),
      );
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
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, alias: next } : x)),
      );
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

  return {
    users,
    filter, setFilter,
    loading,
    refreshing, setRefreshing,
    filtered,
    missingCount,
    onlyMissingContacts, setOnlyMissingContacts,
    editingAliasId,
    aliasDraft, setAliasDraft,
    startEditAlias,
    saveAlias,
    handleToggleAutoForward,
    handleDeleteUser,
    reload: load,
  };
}
