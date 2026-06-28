/**
 * useStep — fetches order + step, manages notes/photos/review-note state,
 * exposes complete/update/reopen/forward actions, and re-fetches on
 * language switch (because step titles localize).
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { api, Order, Step } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { confirmAction, notify } from "@/src/utils/confirm";

export function useStep(orderId: string | undefined, stepNum: number) {
  const router = useRouter();
  const { languageVersion, user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // When a manufacturer/admin taps "UPDATE" on a completed step, flip into
  // edit mode so the same notes/photos form is reused for the patch.
  const [editMode, setEditMode] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const o = await api.getOrder(orderId);
      setOrder(o);
      const s = o.steps.find((x) => x.step_number === stepNum);
      if (s) {
        setStep(s);
        setNotes(s.notes || "");
        // Photos for the editable form must include BOTH live (approved)
        // and pending (awaiting admin approval) entries — otherwise
        // manufacturer uploads appear to "vanish" the moment they save,
        // because backend complete_step / update_completed_step routes
        // their photos into pending_photos.
        const live = s.photos || [];
        const pending = s.pending_photos || [];
        const merged = [...live, ...pending.filter((u) => !live.includes(u))];
        setPhotos(merged);
        setReviewNote(s.associate_review_note || "");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orderId, stepNum]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch when display language changes (step title / phase title
  // localize when STEP_I18N is keyed).
  useEffect(() => {
    if (!loading) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageVersion]);

  const handleComplete = useCallback(async () => {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    try {
      const newCount = photos.length;
      await api.completeStep(orderId, stepNum, notes, photos);
      // Manufacturer uploads are queued for admin approval — explain so
      // they don't think their photos vanished after the redirect.
      if (user?.role === "manufacturer" && newCount > 0) {
        notify(
          newCount === 1
            ? "1 photo pending review"
            : `${newCount} photos pending review`,
          "Your uploads are queued for atelier moderation. They'll appear to the client once approved.",
        );
      }
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }, [orderId, stepNum, notes, photos, router, user?.role]);

  const handleUpdate = useCallback(async () => {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    try {
      const beforeCount = (step?.photos?.length || 0) + (step?.pending_photos?.length || 0);
      await api.updateStep(orderId, stepNum, notes, photos);
      setEditMode(false);
      await load();
      // Same explanation as on /complete: manufacturer uploads land in
      // the pending queue, not the live photos array.
      if (
        user?.role === "manufacturer" &&
        photos.length > beforeCount
      ) {
        const added = photos.length - beforeCount;
        notify(
          added === 1
            ? "1 new photo pending review"
            : `${added} new photos pending review`,
          "Your uploads are queued for atelier moderation.",
        );
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }, [orderId, stepNum, notes, photos, load, step, user?.role]);

  const handleReopen = useCallback(() => {
    if (!orderId) return;
    confirmAction({
      title: "Remove completion?",
      message:
        "This step will be marked as not done and any forwarding will be reset. Your notes and photos are kept so you can resume.",
      confirmLabel: "Remove complete",
      destructive: true,
      onConfirm: async () => {
        setSaving(true);
        setError(null);
        try {
          await api.reopenStep(orderId, stepNum);
          await load();
        } catch (e: any) {
          setError(e?.message ?? "Failed");
        } finally {
          setSaving(false);
        }
      },
    });
  }, [orderId, stepNum, load]);

  const handleForward = useCallback(async () => {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    try {
      await api.forwardStep(orderId, stepNum, reviewNote);
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }, [orderId, stepNum, reviewNote, router]);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
    setNotes(step?.notes || "");
    const live = step?.photos || [];
    const pending = step?.pending_photos || [];
    // Reset to the same merged-live+pending view we use on load.
    setPhotos([
      ...live,
      ...pending.filter((u) => !live.includes(u)),
    ]);
  }, [step]);

  return {
    order,
    step,
    loading,
    saving,
    notes,
    setNotes,
    reviewNote,
    setReviewNote,
    photos,
    setPhotos,
    error,
    setError,
    editMode,
    setEditMode,
    load,
    handleComplete,
    handleUpdate,
    handleReopen,
    handleForward,
    cancelEdit,
  };
}
