/** Dashboard data fetch + error classification hook. */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/src/api/client";
import type { DateRangeValue } from "@/src/screens/admin-library/DateRangePresets";
import type { DashboardData } from "./types";

export function useDashboard(dateRange: DateRangeValue) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setForbidden(false);
    try {
      const d = await api.getDashboard({
        date_from: dateRange.date_from || undefined,
        date_to: dateRange.date_to || undefined,
      });
      setData(d);
    } catch (e: any) {
      const msg = e?.message ?? String(e ?? "Failed to load dashboard");
      console.warn("dashboard", e);
      setError(msg);
      if (/401|unauthor|expired|invalid token/i.test(msg) || e?.status === 401) {
        setAuthExpired(true);
      } else if (/403|forbidden|not allowed/i.test(msg) || e?.status === 403) {
        setForbidden(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange.date_from, dateRange.date_to]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    authExpired,
    forbidden,
    load,
    onRefresh,
    setLoading,
  };
}
