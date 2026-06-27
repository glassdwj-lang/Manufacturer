/**
 * RendersScreen — admin / vendor upload UI + admin approval queue for
 * the per-order Renders folder. Composes:
 *   • useRenders() — fetch, approve/reject/delete, vendor management
 *   • RenderRow — single-file UI
 *   • VendorAssignModal — admin-only vendor picker
 *
 * Upload flow uses `uploadCadFile` (Cloudinary signed upload, supports
 * any resource type) so both admins and cad_renderer vendors can push
 * images straight to the live or pending queue.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { uploadCadFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";
import { useAuth } from "@/src/context/AuthContext";
import { BrandStrip } from "@/src/components/BrandStrip";
import { useI18n } from "@/src/i18n";

import { RenderRow } from "./RenderRow";
import { VendorAssignModal } from "./VendorAssignModal";
import { useRenders } from "./useRenders";
import { styles } from "./styles";

export default function RendersScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const orderId = String(params.id || "");
  const safeBack = useSafeBack(`/(app)/order/${orderId}`);
  const { user } = useAuth();
  const { t } = useI18n();
  const r = useRenders(orderId);

  const [uploading, setUploading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const isVendor = user?.role === "cad_renderer";
  const canUpload = isAdmin || isVendor;

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
      await r.load();
      if (isVendor) {
        notify(
          t("renders.toast.submitted_title"),
          t("renders.toast.submitted_msg"),
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const onReject = async (file: any) => {
    const ok = await confirmAction(
      t("renders.confirm.reject_title"),
      t("renders.confirm.reject_msg", { name: file.name }),
      "Reject",
    );
    if (ok) await r.rejectOne(file);
  };

  const onDelete = async (file: any, isPending: boolean) => {
    const ok = await confirmAction(
      t("renders.confirm.delete_title"),
      t(
        isPending
          ? "renders.confirm.delete_msg_pending"
          : "renders.confirm.delete_msg_live",
        { name: file.name },
      ),
      "Delete",
    );
    if (ok) await r.deleteOne(file);
  };

  const openAssign = async () => {
    setAssignOpen(true);
    await r.ensureVendorRoster();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity onPress={safeBack} testID="renders-back">
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("renders.title")}</Text>
        <View style={{ width: 22 }} />
      </View>

      {isAdmin ? (
        <TouchableOpacity
          onPress={openAssign}
          style={styles.vendorBar}
          testID="renders-assign-vendor"
        >
          <Ionicons
            name={r.vendorId ? "person-circle" : "person-add-outline"}
            size={16}
            color={theme.primary}
          />
          <Text style={styles.vendorBarText}>
            {r.vendorName
              ? t("renders.assign.current", { name: r.vendorName.toUpperCase() })
              : t("renders.assign.empty")}
          </Text>
          <Ionicons name="chevron-down" size={14} color={theme.primary} />
        </TouchableOpacity>
      ) : (
        r.vendorName && (
          <Text style={styles.vendorPill}>
            {t("renders.assign.current", { name: r.vendorName })}
          </Text>
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
                {isVendor ? t("renders.upload.vendor") : t("renders.upload.admin")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={r.refreshing}
            onRefresh={r.onRefresh}
            tintColor={theme.primary}
          />
        }
        data={[]}
        keyExtractor={() => ""}
        renderItem={null as any}
        ListHeaderComponent={
          <>
            {r.pending.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>
                  {t("renders.section.pending", { n: r.pending.length })}
                </Text>
                <Text style={styles.sectionHint}>
                  {isAdmin
                    ? t("renders.section.pending_hint_admin")
                    : t("renders.section.pending_hint_vendor")}
                </Text>
                {r.pending.map((file) => {
                  const canDelete =
                    !!isAdmin ||
                    (isVendor && file.uploaded_by === user?.id);
                  return (
                    <RenderRow
                      key={file.id}
                      file={file}
                      isPending
                      isAdmin={!!isAdmin}
                      canDelete={canDelete}
                      busyId={r.busyId}
                      onApprove={r.approveOne}
                      onReject={onReject}
                      onDelete={(f) => onDelete(f, true)}
                    />
                  );
                })}
              </>
            )}
            <Text
              style={[
                styles.sectionLabel,
                r.pending.length > 0 && { marginTop: spacing.xl },
              ]}
            >
              {t("renders.section.live", { n: r.live.length })}
            </Text>
            {r.live.length === 0 && !r.loading && (
              <Text style={styles.emptyText}>
                {isAdmin
                  ? t("renders.empty.admin")
                  : isVendor
                    ? t("renders.empty.vendor")
                    : t("renders.empty.viewer")}
              </Text>
            )}
            {r.live.map((file) => (
              <RenderRow
                key={file.id}
                file={file}
                isPending={false}
                isAdmin={!!isAdmin}
                canDelete={!!isAdmin}
                busyId={r.busyId}
                onApprove={r.approveOne}
                onReject={onReject}
                onDelete={(f) => onDelete(f, false)}
              />
            ))}
            {r.loading && (
              <View style={{ paddingVertical: spacing.xxl }}>
                <ActivityIndicator color={theme.primary} />
              </View>
            )}
          </>
        }
      />

      <VendorAssignModal
        visible={assignOpen}
        vendorId={r.vendorId}
        vendorRoster={r.vendorRoster}
        onClose={() => setAssignOpen(false)}
        onPick={async (newId) => {
          const ok = await r.assignVendor(newId);
          if (ok) setAssignOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
