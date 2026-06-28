/** Single row in the renders detail screen — thumbnail, name, byte
 *  count, uploader, plus admin approve/reject buttons (when pending) or
 *  the delete bin (when allowed).
 *
 *  Tapping the thumbnail bubbles up via `onOpen(file)` so the parent can
 *  show the in-app PhotoLightbox (which autoplays videos and supports
 *  swipe between renders).
 */
import React from "react";
import {
  ActivityIndicator,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/src/theme";
import { CadFile } from "@/src/api/client";
import { isVideoUrl } from "@/src/api/cloudinaryUpload";
import { formatBytes } from "@/src/utils/fileFormatting";
import { styles } from "./styles";
import { videoPoster } from "../approvals/utils";

export function RenderRow({
  file,
  isPending,
  isAdmin,
  canDelete,
  busyId,
  onOpen,
  onApprove,
  onReject,
  onDelete,
}: {
  file: CadFile;
  isPending: boolean;
  isAdmin: boolean;
  canDelete: boolean;
  busyId: string | null;
  /** Tapping the thumbnail surfaces the file to the parent so it can
   *  open the in-app PhotoLightbox (which autoplays videos). */
  onOpen: (f: CadFile) => void;
  onApprove: (f: CadFile) => void;
  onReject: (f: CadFile) => void;
  onDelete: (f: CadFile) => void;
}) {
  const busy = busyId === file.id;
  const isVideo = file.secure_url && isVideoUrl(file.secure_url);
  const thumbUri = isVideo ? videoPoster(file.secure_url) : file.secure_url;
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => onOpen(file)}
        style={styles.thumbBtn}
        testID={`render-thumb-${file.id}`}
      >
        {file.secure_url ? (
          <>
            <Image source={{ uri: thumbUri }} style={styles.thumb} />
            {isVideo && (
              <View style={styles.thumbPlayOverlay} pointerEvents="none">
                <Ionicons name="play" size={20} color="#fff" />
              </View>
            )}
          </>
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="image-outline" size={20} color={theme.textMuted} />
          </View>
        )}
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={2}>
          {file.name}
        </Text>
        <Text style={styles.meta}>
          {formatBytes(file.bytes)} • {file.uploaded_by_email || "—"}
        </Text>
      </View>
      {isPending && isAdmin && (
        <>
          <TouchableOpacity
            onPress={() => onApprove(file)}
            disabled={busy}
            style={[styles.actBtn, styles.actBtnApprove]}
            testID={`render-approve-${file.id}`}
          >
            {busy ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Ionicons name="checkmark" size={16} color="#0A0A0A" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onReject(file)}
            disabled={busy}
            style={[styles.actBtn, styles.actBtnReject]}
            testID={`render-reject-${file.id}`}
          >
            <Ionicons name="close" size={16} color="#FF6B6B" />
          </TouchableOpacity>
        </>
      )}
      {canDelete && !(isPending && isAdmin) && (
        <TouchableOpacity
          onPress={() => onDelete(file)}
          disabled={busy}
          style={styles.actBtn}
          testID={`render-delete-${file.id}`}
        >
          <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}
