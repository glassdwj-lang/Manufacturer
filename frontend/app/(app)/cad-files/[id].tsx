import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";

import { api, CadFile } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { uploadCadFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";
import { isPreviewable } from "@/src/components/Model3DViewer";
import { useAuth } from "@/src/context/AuthContext";
import { BrandStrip } from "@/src/components/BrandStrip";
import { EmailFilesModal } from "@/src/components/EmailFilesModal";
import { useI18n } from "@/src/i18n";

// File extensions we explicitly recognise as CAD payloads. Picker doesn't
// strictly limit to these (we accept everything so workshops aren't blocked
// by an obscure extension), but we colour-code the badge for the common ones.
const CAD_EXTS = new Set([
  "stl", "obj", "3dm", "3ds", "step", "stp", "iges", "igs", "ipt",
  "dwg", "dxf", "x_t", "x_b", "sldprt", "sldasm", "prt", "asm",
  "gem", "matrix", "rhino", "skp", "blend", "fbx", "ply", "zip", "rar", "7z",
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

export default function CadFilesScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const orderId = String(params.id || "");
  const safeBack = useSafeBack(`/(app)/order/${orderId}`);
  const { user } = useAuth();
  const { t } = useI18n();
  const [files, setFiles] = useState<CadFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<CadFile[]>([]);
  const isReviewer = user?.role === "admin" || user?.role === "associate";
  const isManufacturer = user?.role === "manufacturer";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [jewelryName, setJewelryName] = useState<string | null>(null);

  // CAD upload is open to admin, associate (pass-through) and manufacturer
  // (goes pending). Other roles get bounced home.
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
        // Split into live vs pending so each list updates in place.
        const live: CadFile[] = [];
        const pending: CadFile[] = [];
        successes.forEach((s) => {
          if (s.queue === "cad_files") live.push(s.entry);
          else pending.push(s.entry);
        });
        if (live.length) setFiles((prev) => [...live, ...prev]);
        if (pending.length) setPendingFiles((prev) => [...pending, ...prev]);
        const totalMsg =
          successes.length === 1
            ? "1 file uploaded"
            : `${successes.length} files uploaded`;
        notify(
          totalMsg,
          isManufacturer
            ? "Pending atelier review — they'll show up to the client once approved."
            : undefined,
        );
      }
    } finally {
      setUploading(false);
    }
  }, [orderId]);

  const openFile = useCallback((file: CadFile) => {
    if (!file.secure_url) return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(file.secure_url, "_blank", "noopener");
      return;
    }
    Linking.openURL(file.secure_url).catch(() => {
      notify("Cannot open file", "No app is available to view this CAD file on the device.");
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
              setPendingFiles((prev) => prev.filter((f) => f.id !== file.id));
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

  // Approve a pending CAD file → promotes it into the live list.
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

  // Reject a pending CAD file (vendor-rejected). Removes from pending; the
  // Cloudinary asset is intentionally kept so admins can re-upload manually.
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
            setPendingFiles((prev) => prev.filter((f) => f.id !== file.id));
          } catch (e: any) {
            notify("Reject failed", e?.message || "Could not reject file.");
          }
        },
      });
    },
    [orderId],
  );

  const renderRow = (item: CadFile, isPending: boolean) => {
    const ext = extOf(item);
    const known = CAD_EXTS.has(ext);
    const can3D = isPreviewable(item.name);
    // Approval buttons surface only on pending rows + only for reviewers.
    const showApprovalActions = isPending && isReviewer;
    // Delete is hidden when approval actions are shown (avoid duplicates).
    const canRemove =
      !showApprovalActions &&
      (isReviewer || item.uploaded_by === user?.id);
    return (
      <View
        style={[styles.row, isPending && styles.rowPending]}
        testID={`cad-row-${item.id}`}
        key={item.id}
      >
        <View style={[styles.extBadge, !known && styles.extBadgeUnknown]}>
          <Text style={styles.extText} numberOfLines={1}>
            {ext.toUpperCase().slice(0, 5)}
          </Text>
        </View>
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
        {can3D && !showApprovalActions && (
          <TouchableOpacity
            testID={`cad-preview-${item.id}`}
            onPress={() =>
              router.push({
                pathname: "/(app)/cad-files/preview/[id]",
                params: {
                  id: orderId,
                  url: item.secure_url,
                  name: item.name,
                },
              })
            }
            style={[styles.iconBtn, styles.iconBtnPrimary]}
          >
            <Ionicons name="cube-outline" size={18} color={theme.primary} />
          </TouchableOpacity>
        )}
        {!showApprovalActions && (
          <TouchableOpacity
            testID={`cad-open-${item.id}`}
            onPress={() => openFile(item)}
            style={styles.iconBtn}
          >
            <Ionicons name="download-outline" size={18} color={theme.primary} />
          </TouchableOpacity>
        )}
        {showApprovalActions && (
          <>
            <TouchableOpacity
              testID={`cad-approve-${item.id}`}
              onPress={() => approveFile(item)}
              style={[styles.iconBtn, styles.iconBtnApprove]}
            >
              <Ionicons name="checkmark" size={18} color="#0A0A0A" />
            </TouchableOpacity>
            <TouchableOpacity
              testID={`cad-reject-${item.id}`}
              onPress={() => rejectFile(item)}
              style={[styles.iconBtn, styles.iconBtnReject]}
            >
              <Ionicons name="close" size={18} color="#FF6B6B" />
            </TouchableOpacity>
          </>
        )}
        {canRemove && (
          <TouchableOpacity
            testID={`cad-delete-${item.id}`}
            onPress={() => deleteFile(item, isPending)}
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
        <TouchableOpacity testID="cad-back" onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("cad_page.title")}</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.subhead}>
        {files.length} file{files.length === 1 ? "" : "s"} attached
        {pendingFiles.length > 0
          ? `  ·  ${pendingFiles.length} pending`
          : ""}
      </Text>

      <TouchableOpacity
        testID="cad-upload-button"
        onPress={pickAndUpload}
        disabled={uploading}
        style={[styles.uploadBtn, uploading && styles.uploadBtnDim]}
      >
        {uploading ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={16} color="#0A0A0A" />
            <Text style={styles.uploadBtnText}>{t("cad_page.upload")}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Email-forward — only meaningful when there are files attached
          and the current user is allowed to send (admin / mfg-of-order). */}
      {files.length > 0 && (
        <TouchableOpacity
          testID="cad-email-button"
          onPress={() => setEmailOpen(true)}
          style={styles.emailBtn}
        >
          <Ionicons name="mail-outline" size={16} color={theme.primary} />
          <Text style={styles.emailBtnText}>
            {`${t("cad_page.email")} (${files.length})`}
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={[]}
        renderItem={null as any}
        keyExtractor={() => ""}
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
        ListHeaderComponent={
          <>
            {pendingFiles.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>
                  {t("cad_page.pending_section", { n: pendingFiles.length })}
                </Text>
                <Text style={styles.sectionHint}>
                  {isReviewer
                    ? t("cad_page.pending_hint_admin")
                    : t("cad_page.pending_hint_vendor")}
                </Text>
                {pendingFiles.map((f) => renderRow(f, true))}
              </>
            )}
            {(files.length > 0 || pendingFiles.length > 0) && (
              <Text
                style={[
                  styles.sectionLabel,
                  pendingFiles.length > 0 && { marginTop: spacing.lg },
                ]}
              >
                {t("cad_page.live_section", { n: files.length })}
              </Text>
            )}
            {files.map((f) => renderRow(f, false))}
            {loading && (
              <View style={{ paddingVertical: spacing.xxl }}>
                <ActivityIndicator color={theme.primary} />
              </View>
            )}
            {!loading && files.length === 0 && pendingFiles.length === 0 && (
              <Text style={styles.emptyText}>
                {t("cad_page.empty_hint")}
              </Text>
            )}
          </>
        }
      />

      <EmailFilesModal
        visible={emailOpen}
        kind="cad"
        files={files}
        jewelryName={jewelryName}
        send={(payload) => api.emailCadFiles(orderId, payload)}
        onClose={() => setEmailOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
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
  rowPending: { borderLeftWidth: 3, borderLeftColor: theme.primary, paddingLeft: spacing.sm },
  iconBtnApprove: {
    borderColor: theme.success || "#5B9279",
    backgroundColor: theme.success || "#5B9279",
  },
  iconBtnReject: {
    borderColor: "#FF6B6B",
  },
  sectionLabel: {
    color: theme.textPrimary,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionHint: {
    color: theme.textMuted,
    fontSize: 10,
    fontStyle: "italic",
    marginBottom: spacing.sm,
    lineHeight: 14,
  },
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
  iconBtnPrimary: { borderColor: theme.primary },
  emptyText: {
    textAlign: "center",
    color: theme.textMuted,
    paddingVertical: spacing.xxl,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
});
