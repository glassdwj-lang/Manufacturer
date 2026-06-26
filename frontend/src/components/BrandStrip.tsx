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
import { theme, spacing } from "@/src/theme";

export function BrandStrip({ size = 12 }: { size?: number }) {
  return (
    <View style={styles.strip}>
      <HeaderLogo size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: "100%",
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    paddingTop: spacing.sm,
  },
});

export default BrandStrip;
