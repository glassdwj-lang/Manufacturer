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
import { useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";

import { api, CadFile } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { uploadCadFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";

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
  const orderId = String(params.id || "");
  const safeBack = useSafeBack(`/(app)/order/${orderId}`);
  const [files, setFiles] = useState<CadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const list = await api.listCadFiles(orderId);
      setFiles(list);
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

  const pickAndUpload = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      setUploading(true);
      const successes: CadFile[] = [];
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
          successes.push(saved);
        } catch (err: any) {
          notify(
            "Upload failed",
            `${asset.name || "file"}: ${err?.message || "Unknown error"}`,
          );
        }
      }
      if (successes.length) {
        setFiles((prev) => [...successes, ...prev]);
        notify(
          successes.length === 1 ? "1 file uploaded" : `${successes.length} files uploaded`,
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
    (file: CadFile) => {
      confirmAction({
        title: "Delete CAD file?",
        message: `Remove ${file.name}? The file will stay on Cloudinary but no longer be associated with this commission.`,
        confirmLabel: "DELETE",
        destructive: true,
        onConfirm: async () => {
          try {
            await api.removeCadFile(orderId, file.id);
            setFiles((prev) => prev.filter((f) => f.id !== file.id));
          } catch (e: any) {
            notify("Delete failed", e?.message || "Could not remove file.");
          }
        },
      });
    },
    [orderId],
  );

  const renderRow = ({ item }: { item: CadFile }) => {
    const ext = extOf(item);
    const known = CAD_EXTS.has(ext);
    return (
      <View style={styles.row} testID={`cad-row-${item.id}`}>
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
        <TouchableOpacity
          testID={`cad-open-${item.id}`}
          onPress={() => openFile(item)}
          style={styles.iconBtn}
        >
          <Ionicons name="download-outline" size={18} color={theme.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          testID={`cad-delete-${item.id}`}
          onPress={() => deleteFile(item)}
          style={styles.iconBtn}
        >
          <Ionicons name="trash-outline" size={18} color={theme.error || "#C8553D"} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="cad-back" onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CAD FILES</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.subhead}>
        {files.length} file{files.length === 1 ? "" : "s"} attached
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
            <Text style={styles.uploadBtnText}>UPLOAD CAD FILES</Text>
          </>
        )}
      </TouchableOpacity>

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
              No CAD files uploaded yet. Tap UPLOAD CAD FILES above to add .stl, .step,
              .3dm, .obj or any other workshop file (multiple selection supported).
            </Text>
          )
        }
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
  uploadBtnText: {
    color: "#0A0A0A",
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
  emptyText: {
    textAlign: "center",
    color: theme.textMuted,
    paddingVertical: spacing.xxl,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
});
