/** Single row in the renders detail screen — thumbnail, name, byte
 *  count, uploader, plus admin approve/reject buttons (when pending) or
 *  the delete bin (when allowed). */
import React from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/src/theme";
import { CadFile } from "@/src/api/client";
import { formatBytes } from "@/src/utils/fileFormatting";
import { styles } from "./styles";

export function RenderRow({
  file,
  isPending,
  isAdmin,
  canDelete,
  busyId,
  onApprove,
  onReject,
  onDelete,
}: {
  file: CadFile;
  isPending: boolean;
  isAdmin: boolean;
  canDelete: boolean;
  busyId: string | null;
  onApprove: (f: CadFile) => void;
  onReject: (f: CadFile) => void;
  onDelete: (f: CadFile) => void;
}) {
  const busy = busyId === file.id;
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => Linking.openURL(file.secure_url)}
        style={styles.thumbBtn}
        testID={`render-thumb-${file.id}`}
      >
        {file.secure_url ? (
          <Image source={{ uri: file.secure_url }} style={styles.thumb} />
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
