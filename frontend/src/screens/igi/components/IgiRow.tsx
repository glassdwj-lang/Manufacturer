/** Single IGI certificate row (thumb + meta + per-row action buttons). */
import React from "react";
import { Text, TouchableOpacity, View, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CadFile } from "@/src/api/client";
import { theme } from "@/src/theme";
import { cloudinaryPreviewImage } from "@/src/utils/cloudinaryUrl";
import { formatBytes, formatWhen } from "@/src/utils/fileFormatting";
import { styles } from "../styles";
import { extOf, IGI_EXTS } from "../utils";

export function IgiRow({
  item,
  isPending,
  isReviewer,
  currentUserId,
  onOpen,
  onApprove,
  onReject,
  onDelete,
}: {
  item: CadFile;
  isPending: boolean;
  isReviewer: boolean;
  currentUserId: string | undefined;
  onOpen: (file: CadFile) => void;
  onApprove: (file: CadFile) => void;
  onReject: (file: CadFile) => void;
  onDelete: (file: CadFile, isPending: boolean) => void;
}) {
  const ext = extOf(item);
  const known = IGI_EXTS.has(ext);
  const showApprovalActions = isPending && isReviewer;
  const canRemove =
    !showApprovalActions &&
    (isReviewer || item.uploaded_by === currentUserId);
  const thumbUri = cloudinaryPreviewImage(item.secure_url, 220);
  return (
    <View
      style={[styles.row, isPending && styles.rowPending]}
      testID={`igi-row-${item.id}`}
    >
      {thumbUri ? (
        <TouchableOpacity
          onPress={() => onOpen(item)}
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
      {!showApprovalActions && (
        <TouchableOpacity
          testID={`igi-open-${item.id}`}
          onPress={() => onOpen(item)}
          style={styles.iconBtn}
        >
          <Ionicons name="download-outline" size={18} color={theme.primary} />
        </TouchableOpacity>
      )}
      {showApprovalActions && (
        <>
          <TouchableOpacity
            testID={`igi-approve-${item.id}`}
            onPress={() => onApprove(item)}
            style={[styles.iconBtn, styles.iconBtnApprove]}
          >
            <Ionicons name="checkmark" size={18} color="#0A0A0A" />
          </TouchableOpacity>
          <TouchableOpacity
            testID={`igi-reject-${item.id}`}
            onPress={() => onReject(item)}
            style={[styles.iconBtn, styles.iconBtnReject]}
          >
            <Ionicons name="close" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </>
      )}
      {canRemove && (
        <TouchableOpacity
          testID={`igi-delete-${item.id}`}
          onPress={() => onDelete(item, isPending)}
          style={styles.iconBtn}
        >
          <Ionicons name="trash-outline" size={18} color={theme.error || "#C8553D"} />
        </TouchableOpacity>
      )}
    </View>
  );
}
