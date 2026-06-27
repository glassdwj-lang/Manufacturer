import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";

import { api, CadFile } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { uploadIgiCertFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";
import { BrandStrip } from "@/src/components/BrandStrip";
import { useAuth } from "@/src/context/AuthContext";
import { cloudinaryPreviewImage } from "@/src/utils/cloudinaryUrl";
import { CertificateViewerModal } from "@/src/components/CertificateViewerModal";
import { EmailFilesModal } from "@/src/components/EmailFilesModal";

// Document types we explicitly recognise for IGI certificates. Backend
// accepts any extension via Cloudinary raw upload, so we only colour-code
// the badge for clarity — never block an upload.
const IGI_EXTS = new Set([
  "pdf", "jpg", "jpeg", "png", "heic", "webp", "tif", "tiff",
]);

function formatBytes(b?: number | null): string {
  if (!b && b !== 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function extOf(file: CadFile): string {
  if (file.format) return file.format.toLowerCase();
  const i = file.name.lastIndexOf(".");
  if (i >= 0) return file.name.slice(i + 1).toLowerCase();
  return "?";
}

export default function IgiCertificatesScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const orderId = String(params.id || "");
  const safeBack = useSafeBack(`/(app)/order/${orderId}`);
  const { user } = useAuth();
  const [files, setFiles] = useState<CadFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<CadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Currently-previewed certificate (null = modal hidden).
  const [preview, setPreview] = useState<CadFile | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [jewelryName, setJewelryName] = useState<string | null>(null);

  // Access: admin, associate (pass-through), manufacturer (goes pending).
  // Other roles bounce home so they never see a 403.
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
  }, [orderId]);

  const openFile = useCallback((file: CadFile) => {
    // Replace the "open in new window" behaviour with an in-app
    // CertificateViewerModal so the user never leaves the commission.
    if (!file?.secure_url) return;
    setPreview(file);
  }, []);

  const deleteFile = useCallback(
    (file: CadFile) => {
      confirmAction({
        title: "Delete IGI certificate?",
        message: `Remove ${file.name}? The file stays on Cloudinary but no longer belongs to this commission.`,
        confirmLabel: "DELETE",
        destructive: true,
        onConfirm: async () => {
          try {
            await api.removeIgiCertificate(orderId, file.id);
            setFiles((prev) => prev.filter((f) => f.id !== file.id));
          } catch (e: any) {
            notify("Delete failed", e?.message || "Could not remove certificate.");
          }
        },
      });
    },
    [orderId],
  );

  const renderRow = ({ item }: { item: CadFile }) => {
    const ext = extOf(item);
    const known = IGI_EXTS.has(ext);
    const isAdmin = user?.role === "admin";
    const canRemove = isAdmin || item.uploaded_by === user?.id;
    const thumbUri = cloudinaryPreviewImage(item.secure_url, 220);
    return (
      <View style={styles.row} testID={`igi-row-${item.id}`}>
        {thumbUri ? (
          <TouchableOpacity
            onPress={() => openFile(item)}
            style={styles.thumbWrap}
            testID={`igi-thumb-${item.id}`}
          >
            <Image
              source={{ uri: thumbUri }}
              style={styles.thumb}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : (
          <View style={[styles.extBadge, !known && styles.extBadgeUnknown]}>
            <Text style={styles.extText} numberOfLines={1}>
              {ext.toUpperCase().slice(0, 5)}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.rowMeta}>
            {formatBytes(item.bytes)}  ·  {formatWhen(item.uploaded_at)}
          </Text>
          {item.uploaded_by_email ? (
            <Text style={styles.rowMeta}>by {item.uploaded_by_email}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          testID={`igi-open-${item.id}`}
          onPress={() => openFile(item)}
          style={styles.iconBtn}
        >
          <Ionicons name="download-outline" size={18} color={theme.primary} />
        </TouchableOpacity>
        {canRemove && (
          <TouchableOpacity
            testID={`igi-delete-${item.id}`}
            onPress={() => deleteFile(item)}
            style={styles.iconBtn}
          >
            <Ionicons name="trash-outline" size={18} color={theme.error || "#C8553D"} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity testID="igi-back" onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>IGI CERTIFICATES</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.subhead}>
        {files.length} certificate{files.length === 1 ? "" : "s"} attached
      </Text>

      <TouchableOpacity
        testID="igi-upload-button"
        onPress={pickAndUpload}
        disabled={uploading}
        style={[styles.uploadBtn, uploading && styles.uploadBtnDim]}
      >
        {uploading ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={16} color="#0A0A0A" />
            <Text style={styles.uploadBtnText}>UPLOAD IGI CERTIFICATES</Text>
          </>
        )}
      </TouchableOpacity>

      {files.length > 0 && (
        <TouchableOpacity
          testID="igi-email-button"
          onPress={() => setEmailOpen(true)}
          style={styles.emailBtn}
        >
          <Ionicons name="mail-outline" size={16} color={theme.primary} />
          <Text style={styles.emailBtnText}>
            EMAIL CERTIFICATES ({files.length})
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={files}
        renderItem={renderRow}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: spacing.xxl }}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : (
            <Text style={styles.emptyText}>
              No IGI certificates uploaded yet. Tap UPLOAD IGI CERTIFICATES
              above to attach the digital lab report (PDF, JPEG, PNG — any file
              type accepted).
            </Text>
          )
        }
      />

      {/* In-app full-screen preview — mirrors the photo lightbox so
          users have one consistent close affordance across the app. */}
      <CertificateViewerModal
        visible={!!preview}
        url={preview?.secure_url || null}
        title={preview?.name || null}
        onClose={() => setPreview(null)}
      />

      <EmailFilesModal
        visible={emailOpen}
        kind="igi"
        files={files}
        jewelryName={jewelryName}
        send={(payload) => api.emailIgiCertificates(orderId, payload)}
        onClose={() => setEmailOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg || theme.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    color: theme.textPrimary,
    fontSize: 14,
    letterSpacing: 4,
    fontWeight: "600",
  },
  subhead: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  uploadBtn: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: theme.primary,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadBtnDim: { opacity: 0.6 },
  uploadBtnText: {
    color: "#0A0A0A",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
  },
  emailBtn: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emailBtnText: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  extBadge: {
    minWidth: 44,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.primary,
    alignItems: "center",
  },
  extBadgeUnknown: { borderColor: theme.border },
  extText: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  thumbWrap: {
    width: 56,
    height: 72,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  thumb: { width: "100%", height: "100%" },
  rowName: { color: theme.textPrimary, fontSize: 13, fontWeight: "600" },
  rowMeta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  emptyText: {
    textAlign: "center",
    color: theme.textMuted,
    paddingVertical: spacing.xxl,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
});
