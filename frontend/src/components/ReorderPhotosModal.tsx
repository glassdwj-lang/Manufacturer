/**
 * ReorderPhotosModal — full-screen reordering UI for a step's photos and
 * videos. Wraps `react-native-draggable-flatlist` so admin / manufacturer
 * can drag rows to any position, and exposes "TO TOP" / "TO BOTTOM"
 * shortcut buttons on every row for long galleries where dragging
 * across many items would be tedious.
 *
 * Lives inside a Modal — that lets us host its own GestureHandlerRootView
 * without fighting the parent ScrollView on the step screen, and lets us
 * dismiss with CANCEL (keep original order) or DONE (commit the new
 * order back to the parent via `onConfirm(orderedUris)`).
 */
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";

import { theme, spacing } from "@/src/theme";

function isVideoUrl(url: string): boolean {
  return typeof url === "string" && url.includes("/video/upload/");
}

function videoPoster(url: string): string {
  // Reuse the same trick we use elsewhere: ask Cloudinary to render the
  // first frame as a JPG poster for the row thumbnail.
  return url
    .replace("/video/upload/", "/video/upload/f_jpg,so_0,w_120/")
    .replace(/\.(mp4|mov|webm|m4v|3gp|m3u8)$/i, ".jpg");
}

type Item = { id: string; uri: string };

export type ReorderPhotosModalProps = {
  visible: boolean;
  photos: string[];
  onCancel: () => void;
  onConfirm: (orderedUris: string[]) => void;
};

export function ReorderPhotosModal({
  visible,
  photos,
  onCancel,
  onConfirm,
}: ReorderPhotosModalProps) {
  // Stable per-row id so DraggableFlatList can track rows across renders
  // even when two URIs happen to be identical (rare but possible).
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    if (!visible) return;
    setItems(photos.map((uri, i) => ({ id: `${i}-${uri}`, uri })));
  }, [visible, photos]);

  const moveTo = (from: number, to: number) => {
    setItems((cur) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= cur.length ||
        to >= cur.length
      )
        return cur;
      const next = cur.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<Item>) => {
    const idx = getIndex() ?? 0;
    const isVideo = isVideoUrl(item.uri);
    return (
      <ScaleDecorator>
        <View style={[styles.row, isActive && styles.rowActive]}>
          {/* Drag handle on the left — long-press / hold to pick up. */}
          <TouchableOpacity
            onLongPress={drag}
            delayLongPress={120}
            disabled={isActive}
            style={styles.handle}
            accessibilityLabel="Drag handle"
          >
            <Ionicons name="reorder-three-outline" size={22} color={theme.primary} />
          </TouchableOpacity>

          {/* Thumbnail */}
          <View style={styles.thumbWrap}>
            <Image
              source={{ uri: isVideo ? videoPoster(item.uri) : item.uri }}
              style={styles.thumb}
            />
            {isVideo && (
              <View style={styles.playOverlay} pointerEvents="none">
                <Ionicons name="play" size={14} color="#fff" />
              </View>
            )}
          </View>

          {/* Position label */}
          <View style={{ flex: 1 }}>
            <Text style={styles.position}>POSITION {idx + 1}</Text>
            <Text style={styles.fileType}>{isVideo ? "Video" : "Photo"}</Text>
          </View>

          {/* TO TOP / TO BOTTOM shortcuts for long galleries. Disabled
              when the row is already in the target position. */}
          <View style={styles.shortcuts}>
            <TouchableOpacity
              testID={`reorder-to-top-${idx}`}
              onPress={() => moveTo(idx, 0)}
              disabled={idx === 0}
              style={[styles.shortcutBtn, idx === 0 && styles.shortcutBtnDim]}
              accessibilityLabel="Move to top"
            >
              <Ionicons
                name="arrow-up"
                size={14}
                color={idx === 0 ? theme.textMuted : theme.primary}
              />
              <Text
                style={[styles.shortcutText, idx === 0 && styles.shortcutTextDim]}
              >
                TOP
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`reorder-to-bottom-${idx}`}
              onPress={() => moveTo(idx, items.length - 1)}
              disabled={idx === items.length - 1}
              style={[
                styles.shortcutBtn,
                idx === items.length - 1 && styles.shortcutBtnDim,
              ]}
              accessibilityLabel="Move to bottom"
            >
              <Ionicons
                name="arrow-down"
                size={14}
                color={
                  idx === items.length - 1 ? theme.textMuted : theme.primary
                }
              />
              <Text
                style={[
                  styles.shortcutText,
                  idx === items.length - 1 && styles.shortcutTextDim,
                ]}
              >
                END
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity testID="reorder-cancel" onPress={onCancel}>
              <Text style={styles.cancel}>CANCEL</Text>
            </TouchableOpacity>
            <Text style={styles.title}>REARRANGE</Text>
            <TouchableOpacity
              testID="reorder-done"
              onPress={() => onConfirm(items.map((i) => i.uri))}
            >
              <Text style={styles.done}>DONE</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Hold the ≡ handle to drag · use TOP / END for long lists
          </Text>
          <DraggableFlatList
            data={items}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            onDragEnd={({ data }) => setItems(data)}
            activationDistance={Platform.OS === "web" ? 5 : 10}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.xxl,
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                No photos to rearrange. Add some via the ADD button first.
              </Text>
            }
          />
        </GestureHandlerRootView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 13,
    letterSpacing: 4,
    fontWeight: "700",
  },
  cancel: {
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "600",
  },
  done: {
    color: theme.primary,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
  hint: {
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 1.4,
    padding: spacing.md,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  rowActive: {
    backgroundColor: "rgba(184, 115, 51, 0.15)",
    borderRadius: 4,
  },
  handle: {
    width: 32,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbWrap: { width: 56, height: 56, position: "relative" },
  thumb: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: theme.border,
  },
  playOverlay: {
    position: "absolute",
    top: 18,
    left: 18,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  position: {
    color: theme.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  fileType: {
    color: theme.textMuted,
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 1,
  },
  shortcuts: { flexDirection: "row", gap: 6 },
  shortcutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  shortcutBtnDim: {
    borderColor: theme.border,
  },
  shortcutText: {
    color: theme.primary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  shortcutTextDim: { color: theme.textMuted },
  empty: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: spacing.xxl,
    fontStyle: "italic",
  },
});

export default ReorderPhotosModal;
