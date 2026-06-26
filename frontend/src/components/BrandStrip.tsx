/**
 * Thin brand strip rendered above every screen's existing header bar.
 *
 * Centers the small {@link HeaderLogo} on the page background — no border,
 * no extra chrome. Apps that want a different placement can drop in the
 * HeaderLogo component directly instead of using BrandStrip.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { HeaderLogo } from "./HeaderLogo";
import { spacing } from "@/src/theme";

export function BrandStrip({ size = 28 }: { size?: number }) {
  return (
    <View style={styles.strip}>
      <HeaderLogo size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: "100%",
    // Translucent so the page background bleeds through behind the
    // wordmark — sits naturally on hero photography and dark surfaces.
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    paddingTop: spacing.sm,
  },
});

export default BrandStrip;
