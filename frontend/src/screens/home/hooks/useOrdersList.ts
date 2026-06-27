/**
 * useOrdersList — orchestrates the home commission list fetch.
 *
 * Combines:
 *   - `loading` / `refreshing` lifecycle flags
 *   - the active filter payload → `api.listOrders` call
 *   - the staff-only aggregated approvals badge count
 *   - bulk-select state (mode + selection set + bulk delete)
 *
 * Returns everything the page-level component needs to render plus a
 * `reload()` helper for pull-to-refresh.
 */
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api, Order } from "@/src/api/client";
import { confirmAction } from "@/src/utils/confirm";
import { useI18n } from "@/src/i18n";
import { AppliedFilters } from "../types";

type Role = string;

export function useOrdersList({
  role,
  languageVersion,
  applied,
}: {
  role: Role | undefined;
  languageVersion: number;
  applied: AppliedFilters;
}) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approvalsCount, setApprovalsCount] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.listOrders({
        client_id: applied.client || undefined,
        manufacturer_id: applied.mfg || undefined,
        associate_id: applied.assoc || undefined,
        q: applied.q || undefined,
        date_from: applied.from || undefined,
        date_to: applied.to || undefined,
      });
      setOrders(list);
      if (role === "admin" || role === "associate") {
        try {
          const counts = await api.adminPendingCounts();
          setApprovalsCount(counts.total || 0);
        } catch {
          setApprovalsCount(0);
        }
      } else {
        setApprovalsCount(0);
      }
    } catch (e) {
      console.warn("load orders", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role, applied]);

  // Refresh on focus + initial mount + manual language switch.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageVersion]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // ---- Bulk select helpers ------------------------------------------------
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterSelect = useCallback(() => setSelectMode(true), []);
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const bulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    confirmAction({
      title: t("home.confirm.bulk_title", {
        n: ids.length,
        s: ids.length === 1 ? "" : "s",
      }),
      message: t("home.confirm.bulk_message"),
      confirmLabel: t("home.confirm.bulk_confirm", { n: ids.length }),
      destructive: true,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await api.bulkSoftDeleteOrders(ids);
          exitSelect();
          await load();
        } catch (e) {
          console.warn("bulk delete", e);
        } finally {
          setBulkBusy(false);
        }
      },
    });
  }, [selectedIds, exitSelect, load, t]);

  return {
    orders,
    loading,
    refreshing,
    onRefresh,
    approvalsCount,
    selectMode,
    selectedIds,
    bulkBusy,
    enterSelect,
    exitSelect,
    toggleSelect,
    bulkDelete,
  };
}
