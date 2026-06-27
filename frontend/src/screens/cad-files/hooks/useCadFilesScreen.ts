/**
 * useCadFilesScreen — owns the per-order CAD page state machine: load
 * lifecycle, upload pipeline (Cloudinary → server), open/preview, and
 * the approve/reject/delete actions. The screen component is purely
 * presentational and subscribes to the values returned here.
 */
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { api, CadFile } from "@/src/api/client";
import { uploadCadFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";
import { useAuth } from "@/src/context/AuthContext";

export function useCadFilesScreen(orderId: string) {
  const router = useRouter();
  const { user } = useAuth();
  const isReviewer = user?.role === "admin" || user?.role === "associate";
  const isManufacturer = user?.role === "manufacturer";

  const [files, setFiles] = useState<CadFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<CadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [jewelryName, setJewelryName] = useState<string | null>(null);

  // CAD upload allowed for admin/associate (pass-through) and manufacturer
  // (queued as pending). Everyone else gets bounced home.
  useEffect(() => {
    if (
      user &&
      user.role !== "admin" &&
      user.role !== "associate" &&
      user.role !== "manufacturer"
    ) {
      router.replace("/(app)");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const data = await api.listCadFiles(orderId);
      setFiles(data.cad_files || []);
      setPendingFiles(data.pending_cad_files || []);
    } catch (e) {
      console.warn("cad files load", e);
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
        console.warn("cad order meta load", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

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
          const up = await uploadCadFile({
            uri: asset.uri,
            name: asset.name || "cad-file",
            size: asset.size ?? null,
            mimeType: asset.mimeType ?? null,
          });
          const saved = await api.addCadFile(orderId, {
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
          if (s.queue === "cad_files") live.push(s.entry);
          else pending.push(s.entry);
        });
        if (live.length) setFiles((prev) => [...live, ...prev]);
        if (pending.length)
          setPendingFiles((prev) => [...pending, ...prev]);
        const totalMsg =
          successes.length === 1
            ? "1 file uploaded"
            : `${successes.length} files uploaded`;
        notify(
          totalMsg,
          isManufacturer
            ? "Pending atelier review \u2014 they'll show up to the client once approved."
            : undefined,
        );
      }
    } finally {
      setUploading(false);
    }
  }, [orderId, isManufacturer]);

  const openFile = useCallback((file: CadFile) => {
    if (!file.secure_url) return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(file.secure_url, "_blank", "noopener");
      return;
    }
    Linking.openURL(file.secure_url).catch(() => {
      notify(
        "Cannot open file",
        "No app is available to view this CAD file on the device.",
      );
    });
  }, []);

  const deleteFile = useCallback(
    (file: CadFile, isPending: boolean) => {
      confirmAction({
        title: "Delete CAD file?",
        message: `Remove ${file.name}? The file will stay on Cloudinary but no longer be associated with this commission.`,
        confirmLabel: "DELETE",
        destructive: true,
        onConfirm: async () => {
          try {
            if (isPending) {
              await api.rejectCadFile(orderId, file.id);
              setPendingFiles((prev) =>
                prev.filter((f) => f.id !== file.id),
              );
            } else {
              await api.removeCadFile(orderId, file.id);
              setFiles((prev) => prev.filter((f) => f.id !== file.id));
            }
          } catch (e: any) {
            notify("Delete failed", e?.message || "Could not remove file.");
          }
        },
      });
    },
    [orderId],
  );

  const approveFile = useCallback(
    async (file: CadFile) => {
      try {
        const res = await api.approveCadFile(orderId, file.id);
        setPendingFiles((prev) => prev.filter((f) => f.id !== file.id));
        setFiles((prev) => [res.file, ...prev]);
        notify("Approved", `${file.name} is now visible to the client.`);
      } catch (e: any) {
        notify("Approve failed", e?.message || "Could not approve file.");
      }
    },
    [orderId],
  );

  const rejectFile = useCallback(
    (file: CadFile) => {
      confirmAction({
        title: "Reject CAD file?",
        message: `${file.name} will be removed from the pending queue. The workshop will be notified to re-upload if needed.`,
        confirmLabel: "REJECT",
        destructive: true,
        onConfirm: async () => {
          try {
            await api.rejectCadFile(orderId, file.id);
            setPendingFiles((prev) =>
              prev.filter((f) => f.id !== file.id),
            );
          } catch (e: any) {
            notify("Reject failed", e?.message || "Could not reject file.");
          }
        },
      });
    },
    [orderId],
  );

  return {
    user,
    isReviewer,
    isManufacturer,
    files,
    pendingFiles,
    loading,
    refreshing,
    setRefreshing,
    uploading,
    emailOpen,
    setEmailOpen,
    jewelryName,
    load,
    pickAndUpload,
    openFile,
    approveFile,
    rejectFile,
    deleteFile,
  };
}
