/** Data + mutation hook for the renders detail screen. Owns the live and
 *  pending arrays, the cad_renderer assignment, plus approve/reject/delete
 *  actions. UI components stay focused on presentation. */
import { useCallback, useEffect, useState } from "react";
import { api, CadFile } from "@/src/api/client";
import { notify } from "@/src/utils/confirm";

export type VendorBrief = { id: string; name: string; email: string };

export function useRenders(orderId: string) {
  const [live, setLive] = useState<CadFile[]>([]);
  const [pending, setPending] = useState<CadFile[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [vendorRoster, setVendorRoster] = useState<VendorBrief[] | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const data = await api.listRenders(orderId);
      setLive(data.renders || []);
      setPending(data.pending_renders || []);
      setVendorId(data.cad_renderer_id || null);
      setVendorName(data.cad_renderer_name || null);
    } catch (e) {
      console.warn("renders load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const approveOne = useCallback(
    async (r: CadFile) => {
      try {
        setBusyId(r.id);
        await api.approveRender(orderId, r.id);
        await load();
      } catch (e: any) {
        notify("Approve failed", e?.message || "Could not approve render.");
      } finally {
        setBusyId(null);
      }
    },
    [orderId, load],
  );

  const rejectOne = useCallback(
    async (r: CadFile) => {
      try {
        setBusyId(r.id);
        await api.rejectRender(orderId, r.id);
        await load();
      } catch (e: any) {
        notify("Reject failed", e?.message || "Could not reject render.");
      } finally {
        setBusyId(null);
      }
    },
    [orderId, load],
  );

  const deleteOne = useCallback(
    async (r: CadFile) => {
      try {
        setBusyId(r.id);
        await api.removeRender(orderId, r.id);
        await load();
      } catch (e: any) {
        notify("Delete failed", e?.message || "Could not delete render.");
      } finally {
        setBusyId(null);
      }
    },
    [orderId, load],
  );

  const ensureVendorRoster = useCallback(async () => {
    if (vendorRoster) return;
    try {
      const list = await api.listUsers("cad_renderer");
      setVendorRoster(
        list.map((u: any) => ({
          id: u.id,
          name: u.name || u.email,
          email: u.email,
        })),
      );
    } catch (e: any) {
      notify("Directory error", e?.message || "Could not load vendors.");
    }
  }, [vendorRoster]);

  const assignVendor = useCallback(
    async (newVendorId: string | null) => {
      try {
        await api.assignCadRenderer(orderId, newVendorId);
        await load();
        return true;
      } catch (e: any) {
        notify("Assign failed", e?.message || "Could not assign vendor.");
        return false;
      }
    },
    [orderId, load],
  );

  return {
    // data
    live,
    pending,
    vendorId,
    vendorName,
    vendorRoster,
    // flags
    loading,
    refreshing,
    busyId,
    // actions
    load,
    onRefresh,
    approveOne,
    rejectOne,
    deleteOne,
    ensureVendorRoster,
    assignVendor,
  };
}
