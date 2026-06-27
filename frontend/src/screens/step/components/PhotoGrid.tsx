/** Photo/video grid for a step, with editing affordances (remove,
 *  reorder via chevron arrows) and an uploading-placeholder cell. */
import React from "react";
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isVideoUrl } from "@/src/api/cloudinaryUpload";
import { theme } from "@/src/theme";
import { styles } from "../styles";
import { videoPoster } from "../utils";

export function PhotoGrid({
  photos,
  uploadingCount,
  editable,
  onOpen,
  onRemove,
  onMove,
}: {
  photos: string[];
  uploadingCount: number;
  editable: boolean;
  onOpen: (idx: number) => void;
  onRemove?: (idx: number) => void;
  onMove?: (from: number, to: number) => void;
}) {
  return (
    <View style={styles.photoGrid}>
      {photos.map((p, i) => (
        <View key={i} style={styles.photoCell}>
          <TouchableOpacity
            testID={editable ? `open-photo-${i}` : `open-readonly-photo-${i}`}
            activeOpacity={0.85}
            onPress={() => onOpen(i)}
          >
            <Image
              source={{ uri: isVideoUrl(p) ? videoPoster(p) : p }}
              style={styles.photoImg}
            />
            {isVideoUrl(p) && (
              <View style={styles.playOverlay} pointerEvents="none">
                <Ionicons name="play" size={20} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          {/* Reorder arrows — only visible when there is room to move in
              that direction. Tapping nudges the asset one slot left/right
              in the photos array; SAVE/COMPLETE persists. */}
          {editable && onMove && photos.length > 1 && i > 0 && (
            <TouchableOpacity
              testID={`move-left-${i}`}
              onPress={() => onMove(i, i - 1)}
              style={[styles.photoArrow, styles.photoArrowLeft]}
              accessibilityLabel="Move earlier"
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Ionicons name="chevron-back" size={14} color="#fff" />
            </TouchableOpacity>
          )}
          {editable && onMove && photos.length > 1 && i < photos.length - 1 && (
            <TouchableOpacity
              testID={`move-right-${i}`}
              onPress={() => onMove(i, i + 1)}
              style={[styles.photoArrow, styles.photoArrowRight]}
              accessibilityLabel="Move later"
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </TouchableOpacity>
          )}
          {editable && onRemove && (
            <TouchableOpacity
              testID={`remove-photo-${i}`}
              onPress={() => onRemove(i)}
              style={styles.photoRemove}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      ))}
      {editable && photos.length === 0 && uploadingCount === 0 && (
        <View style={styles.photoEmpty}>
          <Text style={styles.photoEmptyText}>No photos added</Text>
        </View>
      )}
      {editable && uploadingCount > 0 && (
        <View style={styles.photoUploading} testID="photo-uploading">
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={styles.photoUploadingText}>
            Uploading {uploadingCount}…
          </Text>
        </View>
      )}
    </View>
  );
}
