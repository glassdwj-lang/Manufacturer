/** Customs blob fetch + file upload/remove + text-field save hook. */
import { useCallback, useEffect, useState } from "react";
import { Platform, Linking } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  api,
  CustomsBlob,
  CustomsFile,
  CustomsKind,
} from "@/src/api/client";
import { uploadCustomsFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";
import { useAuth } from "@/src/context/AuthContext";

export function useCustoms(orderId: string | undefined) {
  const { user } = useAuth();
  const [blob, setBlob] = useState<CustomsBlob | null>(null);
  const [airwayText, setAirwayText] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingText, setSavingText] = useState(false);
  const [uploading, setUploading] = useState<CustomsKind | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jewelryName, setJewelryName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const c = await api.getCustoms(orderId);
      setBlob(c);
      setAirwayText(c?.airway_bill_text || "");
      setNotes(c?.notes || "");
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch the jewelry name once so the email-modal subject line can
  // default to something useful (e.g. "Customs documents — Heritage Ring").
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const order = await api.getOrder(orderId);
        if (!cancelled) setJewelryName(order?.jewelry_name || null);
      } catch (e) {
        console.warn("customs order meta load", e);
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

  const pickAndUpload = useCallback(
    async (kind: CustomsKind) => {
      if (!orderId) return;
      try {
        const res = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (res.canceled || !res.assets || res.assets.length === 0) return;
        setUploading(kind);
        const successes: CustomsFile[] = [];
        for (const asset of res.assets) {
          try {
            const up = await uploadCustomsFile({
              uri: asset.uri,
              name: asset.name || "document",
              size: asset.size ?? null,
              mimeType: asset.mimeType ?? null,
            });
            const saved = await api.addCustomsFile(orderId, kind, {
              name: up.name,
              secure_url: up.secure_url,
              format: up.format || null,
              bytes: up.bytes || null,
              resource_type: "raw",
            });
            successes.push(saved);
          } catch (err: any) {
            notify(
              "Upload failed",
              `${asset.name || "file"}: ${err?.message || "Unknown error"}`,
            );
          }
        }
        if (successes.length) {
          setBlob((prev) => {
            const cur = prev || {};
            const field =
              kind === "airway-bill" ? "airway_bill_files" : "customs_files";
            const existing = (cur as any)[field] || [];
            return { ...cur, [field]: [...successes, ...existing] };
          });
          notify(
            successes.length === 1
              ? "1 file uploaded"
              : `${successes.length} files uploaded`,
          );
        }
      } finally {
        setUploading(null);
      }
    },
    [orderId],
  );

  const openFile = useCallback((file: CustomsFile) => {
    if (!file.secure_url) return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(file.secure_url, "_blank", "noopener");
      return;
    }
    Linking.openURL(file.secure_url).catch(() => {
      notify("Cannot open file", "No app is available to view this document.");
    });
  }, []);

  const removeFile = useCallback(
    (kind: CustomsKind, file: CustomsFile) => {
      if (!orderId) return;
      confirmAction({
        title: "Delete document?",
        message: `Remove ${file.name}? The file stays on Cloudinary but no longer belongs to this commission.`,
        confirmLabel: "DELETE",
        destructive: true,
        onConfirm: async () => {
          try {
            await api.removeCustomsFile(orderId, kind, file.id);
            setBlob((prev) => {
              if (!prev) return prev;
              const field =
                kind === "airway-bill" ? "airway_bill_files" : "customs_files";
              return {
                ...prev,
                [field]: ((prev as any)[field] || []).filter(
                  (f: CustomsFile) => f.id !== file.id,
                ),
              };
            });
          } catch (e: any) {
            notify("Delete failed", e?.message || "Could not remove file.");
          }
        },
      });
    },
    [orderId],
  );

  const saveTextFields = useCallback(async () => {
    if (!orderId) return;
    setSavingText(true);
    setError(null);
    try {
      const payload: any = { airway_bill_text: airwayText };
      // Notes are admin-only; backend ignores it for manufacturer.
      if (user?.role === "admin") payload.notes = notes;
      await api.updateCustoms(orderId, payload);
      notify("Saved");
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSavingText(false);
    }
  }, [orderId, airwayText, notes, user]);

  return {
    blob,
    airwayText,
    setAirwayText,
    notes,
    setNotes,
    loading,
    savingText,
    uploading,
    refreshing,
    error,
    jewelryName,
    load,
    refresh,
    pickAndUpload,
    openFile,
    removeFile,
    saveTextFields,
  };
}
