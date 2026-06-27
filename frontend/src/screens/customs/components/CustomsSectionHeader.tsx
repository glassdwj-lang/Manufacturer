/** Section header for AIRWAY BILL / CUSTOMS DOCUMENT blocks. */
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles";

export function CustomsSectionHeader({
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
