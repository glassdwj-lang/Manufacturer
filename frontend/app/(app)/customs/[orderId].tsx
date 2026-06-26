import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";

import { api, CustomsBlob, CustomsFile, CustomsKind } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { uploadCustomsFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";
import { BrandStrip } from "@/src/components/BrandStrip";
import { EmailFilesModal, EmailKind } from "@/src/components/EmailFilesModal";

function formatBytes(b?: number | null): string {
  if (b == null) return "—";
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

function extOf(file: CustomsFile): string {
  if (file.format) return file.format.toLowerCase();
  const i = file.name.lastIndexOf(".");
  if (i >= 0) return file.name.slice(i + 1).toLowerCase();
  return "?";
}

export default function CustomsScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user } = useAuth();

  const [blob, setBlob] = useState<CustomsBlob | null>(null);
  const [airwayText, setAirwayText] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingText, setSavingText] = useState(false);
  const [uploading, setUploading] = useState<CustomsKind | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which Email-files sheet is open. `null` keeps the modal hidden.
  const [emailKind, setEmailKind] = useState<EmailKind | null>(null);
  const [jewelryName, setJewelryName] = useState<string | null>(null);

  // Restrict the customs screen to roles that can either upload or view
  // documents: admin + manufacturer. Everyone else is bounced home.
  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "manufacturer") {
      router.replace("/(app)");
    }
  }, [user, router]);

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

  const pickAndUpload = useCallback(
    async (kind: CustomsKind) => {
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
            const saved = await api.addCustomsFile(orderId!, kind, {
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
      confirmAction({
        title: "Delete document?",
        message: `Remove ${file.name}? The file stays on Cloudinary but no longer belongs to this commission.`,
        confirmLabel: "DELETE",
        destructive: true,
        onConfirm: async () => {
          try {
            await api.removeCustomsFile(orderId!, kind, file.id);
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const airwayFiles = blob?.airway_bill_files || [];
  const customsFiles = blob?.customs_files || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <BrandStrip />
      <View style={styles.headerBar}>
          <TouchableOpacity
            testID="customs-close"
            onPress={safeBack}
            style={{ padding: 4 }}
          >
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.headerEyebrow}>CUSTOMS · CONFIDENTIAL</Text>
            <Text style={styles.headerTitle}>Atelier Documents</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
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
        >
          {/* ---------------------------- AIRWAY BILL ---------------------- */}
          <SectionHeader
            title="AIRWAY BILL"
            count={airwayFiles.length}
            uploading={uploading === "airway-bill"}
            onUpload={() => pickAndUpload("airway-bill")}
            testID="airway"
          />
          <FileList
            files={airwayFiles}
            kind="airway-bill"
            currentUserId={user?.id || ""}
            isAdmin={user?.role === "admin"}
            onOpen={openFile}
            onRemove={removeFile}
            emptyHint="No airway bills uploaded yet. Tap UPLOAD to attach PDF, image or any document."
          />

          {airwayFiles.length > 0 && (
            <TouchableOpacity
              testID="airway-email-button"
              onPress={() => setEmailKind("airway_bill")}
              style={styles.emailBtn}
            >
              <Ionicons name="mail-outline" size={16} color={theme.primary} />
              <Text style={styles.emailBtnText}>
                EMAIL AIRWAY BILL ({airwayFiles.length})
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.formLabel}>AIRWAY BILL — TEXT / TRACKING NUMBER</Text>
          <TextInput
            testID="airway-text-input"
            value={airwayText}
            onChangeText={setAirwayText}
            multiline
            placeholder="e.g. SQ-176-12345678, carrier, route, declared value..."
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { height: 80 }]}
          />

          <View style={{ height: spacing.xl }} />

          {/* ---------------------------- CUSTOMS DOCS --------------------- */}
          <SectionHeader
            title="CUSTOMS DOCUMENT"
            count={customsFiles.length}
            uploading={uploading === "customs"}
            onUpload={() => pickAndUpload("customs")}
            testID="customs"
          />
          <FileList
            files={customsFiles}
            kind="customs"
            currentUserId={user?.id || ""}
            isAdmin={user?.role === "admin"}
            onOpen={openFile}
            onRemove={removeFile}
            emptyHint="No customs documents uploaded yet. Tap UPLOAD to attach declarations, invoices, certificates."
          />

          {customsFiles.length > 0 && (
            <TouchableOpacity
              testID="customs-email-button"
              onPress={() => setEmailKind("customs")}
              style={styles.emailBtn}
            >
              <Ionicons name="mail-outline" size={16} color={theme.primary} />
              <Text style={styles.emailBtnText}>
                EMAIL CUSTOMS DOCS ({customsFiles.length})
              </Text>
            </TouchableOpacity>
          )}

          {user?.role === "admin" && (
            <>
              <Text style={styles.formLabel}>INTERNAL NOTES (ADMIN-ONLY)</Text>
              <TextInput
                testID="customs-notes-input"
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Tracking number, declared value, route, internal flags..."
                placeholderTextColor={theme.textMuted}
                style={[styles.input, { height: 100 }]}
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            testID="customs-save-button"
            onPress={saveTextFields}
            disabled={savingText}
            style={[styles.primaryBtn, savingText && { opacity: 0.6 }]}
          >
            {savingText ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={styles.primaryBtnText}>SAVE TEXT FIELDS</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <EmailFilesModal
        visible={emailKind !== null}
        kind={emailKind || "customs"}
        files={
          emailKind === "airway_bill" ? airwayFiles : customsFiles
        }
        jewelryName={jewelryName}
        send={(payload) =>
          api.emailCustomsFiles(
            orderId!,
            emailKind === "airway_bill" ? "airway-bill" : "customs",
            payload,
          )
        }
        onClose={() => setEmailKind(null)}
      />
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  count,
  uploading,
  onUpload,
  testID,
}: {
  title: string;
  count: number;
  uploading: boolean;
  onUpload: () => void;
  testID: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.formLabel}>{title}</Text>
        <Text style={styles.sectionMeta}>
          {count} file{count === 1 ? "" : "s"} attached
        </Text>
      </View>
      <TouchableOpacity
        testID={`${testID}-upload-button`}
        disabled={uploading}
        onPress={onUpload}
        style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
      >
        {uploading ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={14} color="#0A0A0A" />
            <Text style={styles.uploadBtnText}>UPLOAD</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function FileList({
  files,
  kind,
  currentUserId,
  isAdmin,
  onOpen,
  onRemove,
  emptyHint,
}: {
  files: CustomsFile[];
  kind: CustomsKind;
  currentUserId: string;
  isAdmin: boolean;
  onOpen: (f: CustomsFile) => void;
  onRemove: (kind: CustomsKind, f: CustomsFile) => void;
  emptyHint: string;
}) {
  if (!files.length) {
    return <Text style={styles.emptyText}>{emptyHint}</Text>;
  }
  return (
    <View style={{ marginTop: spacing.sm }}>
      {files.map((file) => {
        const ext = extOf(file).toUpperCase().slice(0, 5);
        const canRemove = isAdmin || file.uploaded_by === currentUserId;
        return (
          <View key={file.id} style={styles.row} testID={`customs-row-${file.id}`}>
            <View style={styles.extBadge}>
              <Text style={styles.extText} numberOfLines={1}>
                {ext}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={2}>
                {file.name}
              </Text>
              <Text style={styles.rowMeta}>
                {formatBytes(file.bytes)}  ·  {formatWhen(file.uploaded_at)}
              </Text>
              {file.uploaded_by_email ? (
                <Text style={styles.rowMeta} numberOfLines={1}>
                  by {file.uploaded_by_email}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              testID={`customs-open-${file.id}`}
              onPress={() => onOpen(file)}
              style={styles.iconBtn}
            >
              <Ionicons name="download-outline" size={18} color={theme.primary} />
            </TouchableOpacity>
            {canRemove && (
              <TouchableOpacity
                testID={`customs-delete-${file.id}`}
                onPress={() => onRemove(kind, file)}
                style={styles.iconBtn}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={theme.error || "#C8553D"}
                />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg || theme.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerEyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 3 },
  headerTitle: { color: theme.textPrimary, fontSize: 18, marginTop: 2 },
  formLabel: {
    color: theme.primary,
    fontSize: 10,
    letterSpacing: 3,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionMeta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  uploadBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
  },
  uploadBtnText: {
    color: "#0A0A0A",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
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
    color: theme.textMuted,
    fontSize: 11,
    paddingVertical: spacing.lg,
    fontStyle: "italic",
    lineHeight: 16,
  },
  input: {
    color: theme.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  error: { color: theme.error, fontSize: 12, marginTop: spacing.md },
  primaryBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  primaryBtnText: {
    color: "#0A0A0A",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
  },
  emailBtn: {
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  emailBtnText: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
  },
});
