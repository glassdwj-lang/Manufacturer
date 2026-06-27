/**
 * Single CAD-file row — badge, name/meta, and a contextual set of icon
 * buttons (3D preview, download, approve, reject, delete). The screen
 * orchestrator decides which props to pass based on the user's role and
 * whether the file is pending vs live.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { CadFile } from "@/src/api/client";
import { theme } from "@/src/theme";
import { isPreviewable } from "@/src/components/Model3DViewer";
import { CAD_EXTS, extOf, formatBytes, formatWhen } from "../format";
import { cadStyles as styles } from "../styles";

export function CadFileRow({
  item,
  isPending,
  isReviewer,
  currentUserId,
  orderId,
  onOpen,
  onApprove,
  onReject,
  onDelete,
}: {
  item: CadFile;
  isPending: boolean;
  isReviewer: boolean;
  currentUserId: string | undefined;
  orderId: string;
  onOpen: (f: CadFile) => void;
  onApprove: (f: CadFile) => void;
  onReject: (f: CadFile) => void;
  onDelete: (f: CadFile, isPending: boolean) => void;
}) {
  const router = useRouter();
  const ext = extOf(item);
  const known = CAD_EXTS.has(ext);
  const can3D = isPreviewable(item.name);
  const showApprovalActions = isPending && isReviewer;
  // Hide trash when approve/reject buttons are showing (avoid duplication).
  const canRemove =
    !showApprovalActions && (isReviewer || item.uploaded_by === currentUserId);

  return (
    <View
      style={[styles.row, isPending && styles.rowPending]}
      testID={`cad-row-${item.id}`}
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
          onPress={() => onOpen(item)}
          style={styles.iconBtn}
        >
          <Ionicons name="download-outline" size={18} color={theme.primary} />
        </TouchableOpacity>
      )}
      {showApprovalActions && (
        <>
          <TouchableOpacity
            testID={`cad-approve-${item.id}`}
            onPress={() => onApprove(item)}
            style={[styles.iconBtn, styles.iconBtnApprove]}
          >
            <Ionicons name="checkmark" size={18} color="#0A0A0A" />
          </TouchableOpacity>
          <TouchableOpacity
            testID={`cad-reject-${item.id}`}
            onPress={() => onReject(item)}
            style={[styles.iconBtn, styles.iconBtnReject]}
          >
            <Ionicons name="close" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </>
      )}
      {canRemove && (
        <TouchableOpacity
          testID={`cad-delete-${item.id}`}
          onPress={() => onDelete(item, isPending)}
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
}

export default CadFileRow;
