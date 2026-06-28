/**
 * RendersScreen — admin / vendor upload UI + admin approval queue for
 * the per-order Renders folder. Composes:
 *   • useRenders() — fetch, approve/reject/delete, vendor management
 *   • RenderRow — single-file UI
 *   • VendorAssignModal — admin-only vendor picker
 *   • MediaModerationModal — admin REJECT now opens the same 24h email
 *     moderation flow that powers Media Approvals, so the uploader gets
 *     a courteous notification with a replacement deadline.
 *
 * Upload flow uses `uploadCadFile` (Cloudinary signed upload, supports
 * any resource type) so both admins and cad_renderer vendors can push
 * images straight to the live or pending queue.
 */
import React, { useEffect, useState } from "react";
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

import { api, CadFile } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { uploadCadFile } from "@/src/api/cloudinaryUpload";
import { confirmAction, notify } from "@/src/utils/confirm";
import { useAuth } from "@/src/context/AuthContext";
import { BrandStrip } from "@/src/components/BrandStrip";
import { useI18n } from "@/src/i18n";
import { PhotoLightbox } from "@/src/components/PhotoLightbox";
import {
  MediaModerationModal,
  ModerationKind,
  ModerationTarget,
} from "@/src/components/MediaModerationModal";

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

  // Order metadata pulled once so the moderation modal can show the
  // jewelry name + order ref in its meta-rows / subject line.
  const [orderMeta, setOrderMeta] = useState<{
    order_ref: string;
    jewelry_name: string;
  } | null>(null);
  // Moderation modal state — opened from the REJECT pill on a pending row.
  const [moderation, setModeration] = useState<{
    kind: ModerationKind;
    target: ModerationTarget;
  } | null>(null);

  // In-app render viewer state — array of URLs and the active index.
  // We build the URL list (live + pending) each time a thumbnail is
  // tapped so the lightbox supports swiping across the whole queue.
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openRender = (file: CadFile) => {
    if (!file?.secure_url) return;
    // Concatenate live + pending so users can swipe between them in the
    // lightbox; videos in either queue will autoplay as they become
    // the active page.
    const urls = [...r.live, ...r.pending].map((f) => f.secure_url).filter(Boolean);
    const idx = Math.max(0, urls.indexOf(file.secure_url));
    setLightboxUrls(urls);
    setLightboxIndex(idx);
  };

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const o = await api.getOrder(orderId);
        if (!cancelled) {
          setOrderMeta({
            order_ref: o?.order_ref || orderId.slice(0, 8),
            jewelry_name: o?.jewelry_name || "—",
          });
        }
      } catch (e) {
        console.warn("renders order meta load", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

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

  const onReject = (file: CadFile) => {
    // Replaces the old plain-confirm reject. We now open the same
    // Media Approvals moderation modal which emails the uploader with
    // a 24h replacement deadline, then atomically removes the render
    // from the pending queue on send-success.
    if (!orderMeta) {
      notify(
        "Almost ready",
        "Loading order details — try again in a moment.",
      );
      return;
    }
    setModeration({
      kind: "reject",
      target: {
        order_id: orderId,
        order_ref: orderMeta.order_ref,
        jewelry_name: orderMeta.jewelry_name,
        photo_url: file.secure_url,
        render_id: file.id,
        render_name: file.name,
        manufacturer_email: file.uploaded_by_email,
        manufacturer_name: file.uploaded_by_email
          ? file.uploaded_by_email.split("@")[0]
          : undefined,
      },
    });
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
                      onOpen={openRender}
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
                onOpen={openRender}
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

      <MediaModerationModal
        visible={!!moderation}
        kind={moderation?.kind || "reject"}
        mode="render"
        target={moderation?.target || null}
        onClose={() => setModeration(null)}
        onCompleted={async () => {
          setModeration(null);
          // Backend already removed the pending render — refresh to
          // reflect the new state.
          await r.load();
          notify(
            "Email sent",
            "The uploader has been notified — render removed from the pending queue.",
          );
        }}
      />

      {/* In-app viewer for renders. PhotoLightbox already autoplays the
          active video via LoopingVideo so any uploaded MP4 begins
          playing the moment the user lands on it. */}
      <PhotoLightbox
        photos={lightboxUrls || []}
        visible={!!lightboxUrls}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxUrls(null)}
      />
    </SafeAreaView>
  );
}
