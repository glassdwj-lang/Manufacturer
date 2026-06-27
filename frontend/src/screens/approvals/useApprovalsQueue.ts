/**
 * useApprovalsQueue — owns the data-fetch + mutation pipeline for the
 * moderation screen. Keeps the UI component focused on rendering by
 * extracting the API plumbing, busy-flag bookkeeping, and the per-item
 * approve / reinstate actions into a single hook.
 *
 * Hold and Reject are *not* exposed here — they go through the
 * MediaModerationModal which talks to `/photos/moderation-email`
 * directly (the modal calls back via `onCompleted` → `reload`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/src/api/client";
import type { QueueItem } from "./types";

export function useApprovalsQueue({
  canModerate,
  isAdmin,
}: {
  canModerate: boolean;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [recycled, setRecycled] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [associateApprovalEnabled, setAssociateApprovalEnabled] =
    useState<boolean | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canModerate) return;
    setLoading(true);
    try {
      const [queue, bin] = await Promise.all([
        api.listPendingPhotos(),
        api.listRecycledPhotos().catch(() => ({ items: [] as QueueItem[] })),
      ]);
      setItems((queue.items as QueueItem[]) || []);
      setRecycled((bin.items as QueueItem[]) || []);
      if (isAdmin) {
        try {
          const s = await api.getAppSettings();
          setAssociateApprovalEnabled(!!s.associate_approval_enabled);
        } catch {
          /* non-fatal */
        }
      }
    } catch (e) {
      console.warn("approvals load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canModerate, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const pending = useMemo(
    () => items.filter((i) => i.status === "pending"),
    [items],
  );
  const onHold = useMemo(
    () => items.filter((i) => i.status === "on_hold"),
    [items],
  );

  const act = useCallback(
    async (fn: () => Promise<unknown>, photoUrl: string) => {
      setBusyUrl(photoUrl);
      try {
        await fn();
        await load();
      } catch (e) {
        console.warn("approval action failed", e);
      } finally {
        setBusyUrl(null);
      }
    },
    [load],
  );

  const approve = useCallback(
    (it: QueueItem) =>
      act(
        () =>
          api.approvePhoto({
            order_id: it.order_id,
            step_number: it.step_number,
            photo_url: it.photo_url,
          }),
        it.photo_url,
      ),
    [act],
  );

  const reinstate = useCallback(
    (it: QueueItem) =>
      act(
        () =>
          api.reinstatePhoto({
            order_id: it.order_id,
            step_number: it.step_number,
            photo_url: it.photo_url,
          }),
        it.photo_url,
      ),
    [act],
  );

  const purge = useCallback(async () => {
    try {
      await api.purgeExpiredPhotos();
      await load();
    } catch (e) {
      console.warn("purge failed", e);
    }
  }, [load]);

  const toggleAssociateApproval = useCallback(
    async (next: boolean) => {
      if (!isAdmin) return;
      setSettingsBusy(true);
      setAssociateApprovalEnabled(next); // optimistic
      try {
        const s = await api.updateAppSettings({
          associate_approval_enabled: next,
        });
        setAssociateApprovalEnabled(!!s.associate_approval_enabled);
      } catch (e) {
        console.warn("toggle associate approval failed", e);
        setAssociateApprovalEnabled(!next);
      } finally {
        setSettingsBusy(false);
      }
    },
    [isAdmin],
  );

  return {
    // data
    items,
    pending,
    onHold,
    recycled,
    // flags
    loading,
    refreshing,
    busyUrl,
    associateApprovalEnabled,
    settingsBusy,
    // actions
    load,
    onRefresh,
    approve,
    reinstate,
    purge,
    toggleAssociateApproval,
  };
}
