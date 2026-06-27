/** IGI certificate load + mutation hook. */
import { useCallback, useEffect, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { api, CadFile } from "@/src/api/client";
import { uploadIgiCertFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";
import { useAuth } from "@/src/context/AuthContext";

export function useIgiCertificates(orderId: string) {
  const { user } = useAuth();
  const [files, setFiles] = useState<CadFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<CadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jewelryName, setJewelryName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const data = await api.listIgiCertificates(orderId);
      setFiles(data.igi_certificates || []);
      setPendingFiles(data.pending_igi_certificates || []);
    } catch (e) {
      console.warn("igi load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Pull the jewelry name once so the email-modal subject line can
  // default to something useful.
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const order = await api.getOrder(orderId);
        if (!cancelled) setJewelryName(order?.jewelry_name || null);
      } catch (e) {
        console.warn("igi order meta load", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const pickAndUpload = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      setUploading(true);
      const successes: { entry: CadFile; queue: string }[] = [];
      for (const asset of res.assets) {
        try {
          const up = await uploadIgiCertFile({
            uri: asset.uri,
            name: asset.name || "igi-certificate",
            size: asset.size ?? null,
            mimeType: asset.mimeType ?? null,
          });
          const saved = await api.addIgiCertificate(orderId, {
            name: up.name,
            secure_url: up.secure_url,
            format: up.format || null,
            bytes: up.bytes || null,
            resource_type: "raw",
          });
          successes.push({ entry: saved.file, queue: saved.queue });
        } catch (err: any) {
          notify(
            "Upload failed",
            `${asset.name || "file"}: ${err?.message || "Unknown error"}`,
          );
        }
      }
      if (successes.length) {
        const live: CadFile[] = [];
        const pending: CadFile[] = [];
        successes.forEach((s) => {
          if (s.queue === "igi_certificates") live.push(s.entry);
          else pending.push(s.entry);
        });
        if (live.length) setFiles((prev) => [...live, ...prev]);
        if (pending.length) setPendingFiles((prev) => [...pending, ...prev]);
        notify(
          successes.length === 1
            ? "1 certificate uploaded"
            : `${successes.length} certificates uploaded`,
          user?.role === "manufacturer"
            ? "Pending atelier review — visible to clients once approved."
            : undefined,
        );
      }
    } finally {
      setUploading(false);
    }
  }, [orderId, user?.role]);

  const deleteFile = useCallback(
    (file: CadFile, isPending: boolean) => {
      confirmAction({
        title: "Delete IGI certificate?",
        message: `Remove ${file.name}? The file stays on Cloudinary but no longer belongs to this commission.`,
        confirmLabel: "DELETE",
        destructive: true,
        onConfirm: async () => {
          try {
            if (isPending) {
              await api.rejectIgiCertificate(orderId, file.id);
              setPendingFiles((prev) => prev.filter((f) => f.id !== file.id));
            } else {
              await api.removeIgiCertificate(orderId, file.id);
              setFiles((prev) => prev.filter((f) => f.id !== file.id));
            }
          } catch (e: any) {
            notify("Delete failed", e?.message || "Could not remove certificate.");
          }
        },
      });
    },
    [orderId],
  );

  const approveFile = useCallback(
    async (file: CadFile) => {
      try {
        const res = await api.approveIgiCertificate(orderId, file.id);
        setPendingFiles((prev) => prev.filter((f) => f.id !== file.id));
        setFiles((prev) => [res.file, ...prev]);
        notify("Approved", `${file.name} is now visible to the client.`);
      } catch (e: any) {
        notify("Approve failed", e?.message || "Could not approve certificate.");
      }
    },
    [orderId],
  );

  const rejectFile = useCallback(
    (file: CadFile) => {
      confirmAction({
        title: "Reject IGI certificate?",
        message: `${file.name} will be removed from the pending queue.`,
        confirmLabel: "REJECT",
        destructive: true,
        onConfirm: async () => {
          try {
            await api.rejectIgiCertificate(orderId, file.id);
            setPendingFiles((prev) => prev.filter((f) => f.id !== file.id));
          } catch (e: any) {
            notify("Reject failed", e?.message || "Could not reject certificate.");
          }
        },
      });
    },
    [orderId],
  );

  return {
    files,
    pendingFiles,
    loading,
    refreshing,
    uploading,
    jewelryName,
    load,
    refresh,
    pickAndUpload,
    deleteFile,
    approveFile,
    rejectFile,
  };
}
