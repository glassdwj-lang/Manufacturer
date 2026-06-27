/** Customs/airway-bill file list — row per attached document. */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme, spacing } from "@/src/theme";
import type { CustomsFile, CustomsKind } from "@/src/api/client";
import { formatBytes, formatWhen } from "@/src/utils/fileFormatting";
import { styles } from "../styles";
import { extOf } from "../utils";

export function CustomsFileList({
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
