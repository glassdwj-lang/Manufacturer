/**
 * MutePill — a thin "MUTED — TAP TO ENABLE SOUND" toast that fades in
 * when a looping video first appears and self-dismisses after a couple
 * of seconds. Designed to live in the same overlay layer as the close /
 * mute buttons on a video surface.
 *
 * Pass `cueKey` (e.g. the active video URL) so the pill re-fires every
 * time the underlying video changes.
 */
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

export type MutePillProps = {
  /** Whether the player is currently muted (pill is meaningless when not). */
  muted: boolean;
  /** Pill is only useful for videos — pass `false` for image pages. */
  showFor?: boolean;
  /** Triggers a fresh fade-in every time this changes (e.g. swiped video). */
  cueKey: string | number | null;
  /** Optional tap handler — usually wired to the parent's toggleMuted. */
  onPress?: () => void;
};

export function MutePill({ muted, showFor = true, cueKey, onPress }: MutePillProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!muted || !showFor) {
      opacity.value = withTiming(0, { duration: 180 });
      return;
    }
    // Fade in, hold for ~1.8s, fade out.
    opacity.value = withSequence(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withDelay(1800, withTiming(0, { duration: 360, easing: Easing.in(Easing.cubic) })),
    );
  }, [muted, showFor, cueKey, opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!muted || !showFor) return null;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, animStyle]}>
      <Pressable onPress={onPress} style={styles.pill} accessibilityRole="button">
        <Ionicons name="volume-mute" size={14} color="#fff" />
        <Text style={styles.text}>MUTED · TAP FOR SOUND</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 56,
    alignSelf: "center",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  text: {
    color: "#fff",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
});

export default MutePill;
