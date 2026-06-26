/**
 * PhotoLightbox — full-screen photo viewer with horizontal swipe between
 * multiple images, a translucent dismiss layer, an index counter, and a
 * close button. Designed for the read-only photo grids on the step detail
 * screen so clients can tap a thumbnail and see provenance imagery in
 * full quality.
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
import { useVideoPlayer, VideoView } from "expo-video";

function isVideoUrl(url: string): boolean {
  return typeof url === "string" && url.includes("/video/upload/");
}

function VideoLightboxPage({
  uri,
  isActive,
  width,
  height,
  onPress,
}: {
  uri: string;
  isActive: boolean;
  width: number;
  height: number;
  onPress: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    // Cloudinary delivers progressive mp4; loop so jewellery clips replay
    // continuously while the user lingers on the page.
    p.loop = true;
  });
  // Auto-play when the page becomes active; pause when we swipe away.
  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);
  return (
    <View style={[styles.page, { width, height }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        // Tap on the video frame dismisses if it's a single short tap;
        // for video we keep this active so users can still close quickly.
        onPress={onPress}
      >
        <VideoView
          player={player}
          style={styles.photo}
          allowsFullscreen
          contentFit="contain"
          nativeControls
        />
      </Pressable>
    </View>
  );
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
          renderItem={({ item, index }) => {
            if (isVideoUrl(item)) {
              return (
                <VideoLightboxPage
                  uri={item}
                  isActive={index === activeIndex && visible}
                  width={width}
                  height={height}
                  onPress={onClose}
                />
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

        {/* Close button */}
        <TouchableOpacity
          style={styles.closeBtn}
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
  page: {
    justifyContent: "center",
    alignItems: "center",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
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
  counterText: {
    color: "#fff",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "600",
  },
  closeBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 22,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
});
