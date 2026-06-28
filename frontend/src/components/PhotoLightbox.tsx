/**
 * PhotoLightbox — full-screen photo viewer with horizontal swipe between
 * multiple images, a translucent dismiss layer, an index counter, a mute
 * toggle, and a close button. Designed for the read-only photo grids on
 * the step detail screen so clients can tap a thumbnail and see
 * provenance imagery in full quality.
 *
 * Videos use the shared {@link LoopingVideo} component so the lightbox,
 * a future dashboard hero video, and any other surface stay aligned on
 * loop / mute behaviour and persisted preferences.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { LoopingVideo, MutePill, useVideoPlaybackPrefs } from "@/src/components/video";

function isVideoUrl(url: string): boolean {
  return typeof url === "string" && url.includes("/video/upload/");
}

export interface PhotoLightboxProps {
  photos: string[];
  visible: boolean;
  initialIndex?: number;
  onClose: () => void;
}

export function PhotoLightbox({ photos, visible, initialIndex = 0, onClose }: PhotoLightboxProps) {
  const listRef = useRef<FlatList<string>>(null);
  const [{ width, height }, setSize] = useState(() => Dimensions.get("window"));
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const { muted, toggleMuted } = useVideoPlaybackPrefs();

  // React to rotation / web window resize so the page width stays in sync.
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => setSize(window));
    return () => sub.remove();
  }, []);

  // Reset to the requested image whenever the modal becomes visible.
  useEffect(() => {
    if (!visible) return;
    setActiveIndex(initialIndex);
    // Give FlatList a tick to mount before scrolling.
    const id = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: initialIndex * width, animated: false });
    }, 0);
    return () => clearTimeout(id);
  }, [visible, initialIndex, width]);

  if (!photos?.length) return null;

  const activeUri = photos[activeIndex] || "";
  const activeIsVideo = isVideoUrl(activeUri);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Tap-to-dismiss layer behind the image */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="lightbox-backdrop" />

        <FlatList
          ref={listRef}
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          onMomentumScrollEnd={(e) =>
            setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)))
          }
          // Web's `pagingEnabled` is implemented via CSS scroll-snap and
          // does NOT reliably fire `onMomentumScrollEnd`. Fall back to a
          // throttled `onScroll` so the counter and active-video state
          // still update as the user swipes.
          onScroll={
            Platform.OS === "web"
              ? (e) => {
                  const next = Math.round(
                    e.nativeEvent.contentOffset.x / Math.max(width, 1),
                  );
                  if (next !== activeIndex) setActiveIndex(next);
                }
              : undefined
          }
          scrollEventThrottle={Platform.OS === "web" ? 32 : undefined}
          renderItem={({ item, index }) => {
            if (isVideoUrl(item)) {
              // No Pressable wrapper here — the video's own native
              // controls (play/pause/scrubber/fullscreen) need to be
              // tappable. Tap-to-dismiss is still available outside the
              // video via the absoluteFill backdrop layer mounted
              // above the FlatList.
              return (
                <View style={[styles.page, { width, height }]}>
                  <LoopingVideo
                    uri={item}
                    isActive={index === activeIndex && visible}
                    style={styles.photo}
                    nativeControls
                    contentFit="contain"
                  />
                </View>
              );
            }
            return (
              <View style={[styles.page, { width, height }]}>
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={onClose}
                  testID="lightbox-photo-press"
                >
                  <Image
                    source={{ uri: item }}
                    style={styles.photo}
                    resizeMode="contain"
                  />
                </Pressable>
              </View>
            );
          }}
        />

        {/* Counter */}
        {photos.length > 1 && (
          <View style={styles.counterPill} pointerEvents="none">
            <Text style={styles.counterText}>
              {activeIndex + 1} / {photos.length}
            </Text>
          </View>
        )}

        {/* Fade-in "MUTED" hint — auto-dismisses after ~2s and re-fires
            whenever a different video page swipes into view. */}
        <MutePill
          muted={muted}
          showFor={activeIsVideo}
          cueKey={activeIsVideo ? activeUri : null}
          onPress={toggleMuted}
        />

        {/* Mute / unmute toggle — only visible when the active page is a
            looping video. Sits to the left of the close button so they
            form a small toolbar in the top-right corner. */}
        {activeIsVideo && (
          <TouchableOpacity
            style={[styles.toolBtn, styles.muteBtn]}
            onPress={toggleMuted}
            testID="lightbox-mute-toggle"
            accessibilityLabel={muted ? "Unmute video" : "Mute video"}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Ionicons
              name={muted ? "volume-mute" : "volume-high"}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
        )}

        {/* Close button */}
        <TouchableOpacity
          style={[styles.toolBtn, styles.closeBtn]}
          onPress={onClose}
          testID="lightbox-close"
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
    justifyContent: "center",
  },
  page: { justifyContent: "center", alignItems: "center" },
  photo: { width: "100%", height: "100%" },
  counterPill: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 24,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderColor: "rgba(255,255,255,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  counterText: { color: "#fff", fontSize: 11, letterSpacing: 2, fontWeight: "600" },
  toolBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 22,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtn: { right: 18 },
  muteBtn: { right: 64 },
});
