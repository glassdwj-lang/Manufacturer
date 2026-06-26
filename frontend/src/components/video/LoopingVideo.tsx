/**
 * LoopingVideo — drop-in <VideoView> that loops infinitely, respects the
 * global muted preference (auto-mutes on first ever play), and pauses
 * automatically when its host screen reports `isActive=false`.
 *
 * Use this anywhere we want to embed a short Cloudinary clip — step
 * thumbnails on the dashboard, hero videos on the home screen, etc.
 *
 * Pair it with {@link MutePill} if you want the "MUTED" hint to flash on
 * first appearance.
 */
import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

import { useVideoPlaybackPrefs } from "./useVideoPlaybackPrefs";

export type LoopingVideoProps = {
  uri: string;
  /** When false, the player pauses (useful for off-screen carousels). */
  isActive?: boolean;
  /** Container style (sizing, border-radius, etc.). */
  style?: StyleProp<ViewStyle>;
  /** Show native OS chrome (default true for the lightbox). */
  nativeControls?: boolean;
  /** Letterbox vs. fill — defaults to "contain". */
  contentFit?: "contain" | "cover" | "fill";
  /** Allow the user to enter full-screen mode (default true). */
  allowsFullscreen?: boolean;
};

export function LoopingVideo({
  uri,
  isActive = true,
  style,
  nativeControls = true,
  contentFit = "contain",
  allowsFullscreen = true,
}: LoopingVideoProps) {
  const { muted } = useVideoPlaybackPrefs();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  // Keep the live player in sync with the global mute preference.
  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      // expo-video silently swallows updates pre-initialisation.
    }
  }, [muted, player]);

  // Pause/resume based on the host's intent.
  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  return (
    <View style={[styles.wrap, style]}>
      <VideoView
        player={player}
        style={styles.fill}
        allowsFullscreen={allowsFullscreen}
        contentFit={contentFit}
        nativeControls={nativeControls}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#000", overflow: "hidden" },
  fill: { width: "100%", height: "100%" },
});

export default LoopingVideo;
