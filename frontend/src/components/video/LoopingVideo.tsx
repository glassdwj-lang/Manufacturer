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
    // Always start muted so browsers (Chrome/Safari) honor autoplay
    // policies. The host's mute preference is then applied via the
    // effect below — when the user explicitly un-mutes, that requires
    // a tap which counts as a user gesture so it stays unmuted.
    p.muted = true;
  });

  // Keep the live player in sync with the global mute preference, but
  // only AFTER the player has had a chance to start muted. The initial
  // setup above forces muted=true so autoplay never gets blocked.
  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      // expo-video silently swallows updates pre-initialisation.
    }
  }, [muted, player]);

  // Pause/resume based on the host's intent. We call play() through a
  // promise wrapper because browser autoplay policies can reject the
  // call as a NotAllowedError — swallowing the rejection prevents an
  // uncaught-promise warning from polluting the console while leaving
  // the video paused (the user can tap the native controls).
  useEffect(() => {
    if (isActive) {
      try {
        const result: any = player.play();
        if (result && typeof result.then === "function") {
          result.catch(() => {
            /* autoplay blocked — user must tap to start */
          });
        }
      } catch {
        /* pre-init: expo-video swallows */
      }
    } else {
      try {
        player.pause();
      } catch {
        /* same */
      }
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
