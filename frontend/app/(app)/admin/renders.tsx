/**
 * Admin · Cross-Order Renders Library
 *
 * Primary filter: CAD/render studio (cad_renderer role).
 * Secondary filter: workshop (manufacturer) for cross-axis filtering.
 *
 * Adds a cross-order UPLOAD action: tapping the button opens an order
 * picker, then the native image picker, then uploads each image to that
 * order's renders endpoint (admin uploads land in the live queue
 * directly per the per-order RendersScreen rules).
 */
import React, { useState } from "react";
import * as ImagePicker from "expo-image-picker";

import { api } from "@/src/api/client";
import {
  CrossOrderLibrary,
  LibraryConfig,
} from "@/src/screens/admin-library/CrossOrderLibrary";
import { uploadCadFile } from "@/src/api/cloudinaryUpload";
import { notify } from "@/src/utils/confirm";
import {
  OrderPickerModal,
  PickableOrder,
} from "@/src/components/OrderPickerModal";
import { PhotoLightbox } from "@/src/components/PhotoLightbox";

export default function RendersLibraryScreen() {
  // Imperative state shared between the library config closure and the
  // surrounding modal — we need a ref-like setter so the closure can
  // pop the picker open from inside the library header.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshFn, setRefreshFn] = useState<(() => void) | null>(null);
  const [uploading, setUploading] = useState(false);
  // In-app render viewer: a single URL is enough since cross-order rows
  // are independent (no "swipe through all renders in the library"
  // affordance — that would be confusing across commissions).
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const config: LibraryConfig = {
    slug: "renders-library",
    kind: "cad",
    icon: "images-outline",
    primary: {
      role: "cad_renderer",
      placeholderKey: "lib.all_studios",
      icon: "images-outline",
    },
    secondary: {
      role: "manufacturer",
      placeholderKey: "lib.all_workshops",
      icon: "business-outline",
    },
    copy: {
      eyebrow: "renders_lib.eyebrow",
      title: "renders_lib.title",
      searchPlaceholder: "renders_lib.search_placeholder",
      empty: "renders_lib.empty",
      emptyHint: "renders_lib.empty_hint",
      selected: "cad_lib.selected",
      clearSelection: "cad_lib.clear_selection",
      emailCta: "renders_lib.email_cta",
      emailCtaPlural: "renders_lib.email_cta_plural",
      open: "cad_lib.open",
    },
    fetchRows: ({ primaryId, secondaryId, q, date_from, date_to }) =>
      api.adminListAllRenders({
        cad_renderer_id: primaryId,
        manufacturer_id: secondaryId,
        q,
        date_from,
        date_to,
      }),
    sendEmail: (payload) => api.adminEmailCrossOrderRenders(payload),
    // In-app viewer — PhotoLightbox autoplays the active video, so any
    // .mp4 render begins playing the moment the user lands on it.
    onOpenFile: (file) => {
      if (file?.secure_url) setLightboxUrl(file.secure_url);
    },
    // Cross-order upload entry-point — opens the order picker, then
    // the native image picker, then performs Cloudinary + addRender
    // for each selected file under the picked order.
    upload: {
      labelKey: "renders_lib.upload",
      icon: "cloud-upload-outline",
      onPress: (refresh: () => void) => {
        // Stash the refresh function so we can call it after upload.
        setRefreshFn(() => refresh);
        setPickerOpen(true);
      },
    },
  };

  const runUploadFor = async (order: PickableOrder) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      let successCount = 0;
      for (const asset of result.assets) {
        const fileName =
          (asset as any).fileName ||
          asset.uri.split("/").pop() ||
          `render-${Date.now()}.jpg`;
        try {
          const meta = await uploadCadFile(asset.uri, fileName);
          await api.addRender(order.id, {
            name: fileName,
            secure_url: meta.secure_url,
            public_id: meta.public_id,
            format: meta.format,
            bytes: meta.bytes,
            resource_type: meta.resource_type,
          });
          successCount += 1;
        } catch (err: any) {
          notify("Upload failed", err?.message || `Could not upload ${fileName}.`);
        }
      }
      if (successCount > 0) {
        notify(
          successCount === 1 ? "1 render uploaded" : `${successCount} renders uploaded`,
          `Added to ${order.jewelry_name} (${order.order_ref}).`,
        );
        if (refreshFn) refreshFn();
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <CrossOrderLibrary config={config} />
      <OrderPickerModal
        visible={pickerOpen}
        title="Upload renders — pick commission"
        subtitle={
          uploading
            ? "Uploading…"
            : "Select the commission these renders belong to."
        }
        onClose={() => {
          if (!uploading) setPickerOpen(false);
        }}
        onPick={async (order) => {
          setPickerOpen(false);
          await runUploadFor(order);
        }}
      />
      {/* Single-render lightbox — autoplays videos via LoopingVideo. */}
      <PhotoLightbox
        photos={lightboxUrl ? [lightboxUrl] : []}
        visible={!!lightboxUrl}
        onClose={() => setLightboxUrl(null)}
      />
    </>
  );
}
