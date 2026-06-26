/**
 * Renders folder — admin / vendor upload UI + admin approval queue.
 *
 * • Admin uploads land directly in `renders` (live) and are visible to
 *   manufacturer + client immediately.
 * • Vendor (cad_renderer) uploads land in `pending_renders` and are
 *   gated by admin approval before clients see them. This mirrors the
 *   step-photo approval flow so users have one consistent moderation
 *   mental model.
 * • Manufacturers, associates and clients can view this page when they
 *   have access to the order, but they only see the live `renders`.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { api, CadFile } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { uploadCadFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";
import { useAuth } from "@/src/context/AuthContext";
import { BrandStrip } from "@/src/components/BrandStrip";

function formatBytes(b?: number | null): string {
  if (!b && b !== 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function RendersScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const orderId = String(params.id || "");
  const safeBack = useSafeBack(`/(app)/order/${orderId}`);
  const { user } = useAuth();

  const [live, setLive] = useState<CadFile[]>([]);
  const [pending, setPending] = useState<CadFile[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [vendorRoster, setVendorRoster] = useState<{id: string; name: string; email: string}[] | null>(null);

  const isAdmin = user?.role === "admin";
  const isVendor = user?.role === "cad_renderer";
  const canUpload = isAdmin || isVendor;

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

  const pickAndUpload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      for (const asset of result.assets) {
        const fileName =
          (asset as any).fileName ||
          asset.uri.split("/").pop() ||
          `render-${Date.now()}.jpg`;
        try {
          // ``uploadCadFile`` is a Cloudinary signed upload — works for
          // any file type. Renders are images so we use the same helper
          // and let Cloudinary detect the resource_type.
          const meta = await uploadCadFile(asset.uri, fileName);
          await api.addRender(orderId, {
            name: fileName,
            secure_url: meta.secure_url,
            public_id: meta.public_id,
            format: meta.format,
            bytes: meta.bytes,
            resource_type: meta.resource_type,
          });
        } catch (err: any) {
          notify("Upload failed", err?.message || `Could not upload ${fileName}.`);
        }
      }
      await load();
      if (isVendor) {
        notify(
          "Submitted for review",
          "Your renders have been queued for admin approval.",
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const approveOne = async (r: CadFile) => {
    try {
      setBusyId(r.id);
      await api.approveRender(orderId, r.id);
      await load();
    } catch (e: any) {
      notify("Approve failed", e?.message || "Could not approve render.");
    } finally {
      setBusyId(null);
    }
  };

  const rejectOne = async (r: CadFile) => {
    const ok = await confirmAction(
      "Reject render?",
      `"${r.name}" will be removed from the pending queue. This cannot be undone.`,
      "Reject",
    );
    if (!ok) return;
    try {
      setBusyId(r.id);
      await api.rejectRender(orderId, r.id);
      await load();
    } catch (e: any) {
      notify("Reject failed", e?.message || "Could not reject render.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteOne = async (r: CadFile, isPending: boolean) => {
    const ok = await confirmAction(
      "Delete render?",
      `"${r.name}" will be removed${isPending ? " from your pending queue" : " from the commission"}.`,
      "Delete",
    );
    if (!ok) return;
    try {
      setBusyId(r.id);
      await api.removeRender(orderId, r.id);
      await load();
    } catch (e: any) {
      notify("Delete failed", e?.message || "Could not delete render.");
    } finally {
      setBusyId(null);
    }
  };

  const openAssign = async () => {
    setAssignOpen(true);
    if (vendorRoster) return;
    try {
      const list = await api.listUsers("cad_renderer");
      setVendorRoster(
        list.map((u: any) => ({ id: u.id, name: u.name || u.email, email: u.email })),
      );
    } catch (e: any) {
      notify("Directory error", e?.message || "Could not load vendors.");
    }
  };

  const assignVendor = async (newVendorId: string | null) => {
    try {
      await api.assignCadRenderer(orderId, newVendorId);
      setAssignOpen(false);
      await load();
    } catch (e: any) {
      notify("Assign failed", e?.message || "Could not assign vendor.");
    }
  };

  const renderRow = (r: CadFile, isPending: boolean) => {
    const canDelete =
      isAdmin ||
      (isVendor && isPending && r.uploaded_by === user?.id);
    return (
      <View key={r.id} style={styles.row}>
        <TouchableOpacity
          onPress={() => Linking.openURL(r.secure_url)}
          style={styles.thumbBtn}
          testID={`render-thumb-${r.id}`}
        >
          {r.secure_url ? (
            <Image source={{ uri: r.secure_url }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Ionicons name="image-outline" size={20} color={theme.textMuted} />
            </View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{r.name}</Text>
          <Text style={styles.meta}>
            {formatBytes(r.bytes)} • {r.uploaded_by_email || "—"}
          </Text>
        </View>
        {isPending && isAdmin && (
          <>
            <TouchableOpacity
              onPress={() => approveOne(r)}
              disabled={busyId === r.id}
              style={[styles.actBtn, styles.actBtnApprove]}
              testID={`render-approve-${r.id}`}
            >
              {busyId === r.id ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <Ionicons name="checkmark" size={16} color="#0A0A0A" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => rejectOne(r)}
              disabled={busyId === r.id}
              style={[styles.actBtn, styles.actBtnReject]}
              testID={`render-reject-${r.id}`}
            >
              <Ionicons name="close" size={16} color="#FF6B6B" />
            </TouchableOpacity>
          </>
        )}
        {canDelete && !(isPending && isAdmin) && (
          <TouchableOpacity
            onPress={() => deleteOne(r, isPending)}
            disabled={busyId === r.id}
            style={styles.actBtn}
            testID={`render-delete-${r.id}`}
          >
            <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity onPress={safeBack} testID="renders-back">
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>RENDERS</Text>
        <View style={{ width: 22 }} />
      </View>

      {isAdmin ? (
        <TouchableOpacity
          onPress={openAssign}
          style={styles.vendorBar}
          testID="renders-assign-vendor"
        >
          <Ionicons
            name={vendorId ? "person-circle" : "person-add-outline"}
            size={16}
            color={theme.primary}
          />
          <Text style={styles.vendorBarText}>
            {vendorName
              ? `ASSIGNED TO ${vendorName.toUpperCase()}`
              : "ASSIGN CAD / RENDER VENDOR"}
          </Text>
          <Ionicons name="chevron-down" size={14} color={theme.primary} />
        </TouchableOpacity>
      ) : (
        vendorName && (
          <Text style={styles.vendorPill}>Assigned to {vendorName}</Text>
        )
      )}

      {canUpload && (
        <TouchableOpacity
          testID="render-upload-button"
          onPress={pickAndUpload}
          disabled={uploading}
          style={[styles.uploadBtn, uploading && styles.uploadBtnDim]}
        >
          {uploading ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={16} color="#0A0A0A" />
              <Text style={styles.uploadBtnText}>
                {isVendor ? "SUBMIT RENDERS FOR REVIEW" : "UPLOAD RENDERS"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
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
        data={[]}
        keyExtractor={() => ""}
        renderItem={null as any}
        ListHeaderComponent={
          <>
            {pending.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>
                  PENDING APPROVAL ({pending.length})
                </Text>
                <Text style={styles.sectionHint}>
                  {isAdmin
                    ? "Approve to publish to the commission; reject to discard."
                    : "Your submissions are waiting for the studio to review them. You can delete an entry below before approval if needed."}
                </Text>
                {pending.map((r) => renderRow(r, true))}
              </>
            )}
            <Text
              style={[
                styles.sectionLabel,
                pending.length > 0 && { marginTop: spacing.xl },
              ]}
            >
              APPROVED RENDERS ({live.length})
            </Text>
            {live.length === 0 && !loading && (
              <Text style={styles.emptyText}>
                {isAdmin
                  ? "No renders published yet. Upload above or wait for the assigned vendor to submit theirs for review."
                  : isVendor
                  ? "Your approved renders will appear here once an admin reviews them."
                  : "No renders have been published for this commission yet."}
              </Text>
            )}
            {live.map((r) => renderRow(r, false))}
            {loading && (
              <View style={{ paddingVertical: spacing.xxl }}>
                <ActivityIndicator color={theme.primary} />
              </View>
            )}
          </>
        }
      />

      {/* Admin vendor assignment picker */}
      <Modal
        visible={assignOpen}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setAssignOpen(false)}
      >
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setAssignOpen(false)}>
              <Ionicons name="close" size={22} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>ASSIGN VENDOR</Text>
            <View style={{ width: 22 }} />
          </View>
          <FlatList
            data={vendorRoster || []}
            keyExtractor={(v) => v.id}
            contentContainerStyle={{ padding: spacing.lg }}
            ListHeaderComponent={
              vendorId ? (
                <Pressable
                  style={[styles.row, styles.unassignRow]}
                  onPress={() => assignVendor(null)}
                  testID="vendor-unassign"
                >
                  <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                  <Text style={[styles.name, { color: "#FF6B6B" }]}>
                    Unassign current vendor
                  </Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              vendorRoster === null ? (
                <ActivityIndicator color={theme.primary} style={{ marginTop: spacing.xl }} />
              ) : (
                <Text style={styles.emptyText}>
                  No CAD/Render vendors exist yet. Create one from Admin → Users.
                </Text>
              )
            }
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.row,
                  item.id === vendorId && styles.rowActive,
                ]}
                onPress={() => assignVendor(item.id)}
                testID={`vendor-pick-${item.id}`}
              >
                <Ionicons
                  name={item.id === vendorId ? "checkmark-circle" : "person-circle-outline"}
                  size={20}
                  color={item.id === vendorId ? theme.primary : theme.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.email}</Text>
                </View>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
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
    fontSize: 13,
    letterSpacing: 4,
    fontWeight: "600",
  },
  vendorPill: {
    color: theme.primary,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(184,115,51,0.08)",
  },
  vendorBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: spacing.sm + 2,
    backgroundColor: "rgba(184,115,51,0.08)",
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  vendorBarText: {
    color: theme.primary,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
  rowActive: {
    backgroundColor: "rgba(184,115,51,0.08)",
  },
  unassignRow: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginBottom: spacing.md,
  },
  uploadBtn: {
    backgroundColor: theme.primary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: 14,
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
  sectionLabel: {
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 2.5,
    fontWeight: "700",
    marginBottom: 6,
  },
  sectionHint: {
    color: theme.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  thumbBtn: { width: 56, height: 56 },
  thumb: { width: 56, height: 56, backgroundColor: "#222" },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  name: { color: theme.textPrimary, fontSize: 13, fontWeight: "500" },
  meta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  actBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  actBtnApprove: { backgroundColor: theme.primary, borderColor: theme.primary },
  actBtnReject: { borderColor: "#FF6B6B" },
});
