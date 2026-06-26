/**
 * SOMNIO header wordmark — the official shield + "SOMNIO.CO" logotype.
 *
 * The PNG asset under ``assets/images/somnio-logo.png`` is a monochrome
 * silhouette with a transparent background. We use React Native's
 * ``tintColor`` to recolor the silhouette to rose gold, which means a
 * single asset serves every theme variation we may ever need.
 *
 * The wrapping container has a translucent dark background so the logo
 * sits naturally on any header surface without competing with content.
 */
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { theme } from "@/src/theme";

const LOGO_SOURCE = require("../../assets/images/somnio-logo.png");

// Intrinsic aspect ratio of the PNG asset (600 × 150).
const ASPECT = 600 / 150;

export type HeaderLogoProps = {
  /** Logo height in points. Default 20 — sized to sit comfortably in
   * a 44-pt header bar. */
  size?: number;
  /** Override the tint colour (defaults to the rose-gold theme token). */
  color?: string;
  /** Optional cap-height "tag" (kept for backwards-compat — currently ignored
   * because the new logotype already includes the wordmark). */
  tag?: string;
};

export function HeaderLogo({ size = 20, color = theme.roseGold }: HeaderLogoProps) {
  const height = size;
  const width = Math.round(size * ASPECT);
  return (
    <View accessibilityLabel="Somnio.Co" style={[styles.wrap, { width, height }]}>
      <Image
        source={LOGO_SOURCE}
        // tintColor recolors all non-transparent pixels — turning the
        // silhouette rose gold while preserving the alpha mask.
        style={[styles.img, { width, height, tintColor: color }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Translucent dark backdrop — sits on the page background without
    // requiring a perfectly opaque match.
    backgroundColor: "rgba(10, 10, 10, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    paddingHorizontal: 6,
  },
  img: { resizeMode: "contain" },
});

export default HeaderLogo;
