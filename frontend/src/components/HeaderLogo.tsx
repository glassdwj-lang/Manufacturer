/**
 * SOMNIO header wordmark.
 *
 * A small SVG-based logotype rendered in rose gold against the dark
 * application background. Drops into every screen's header bar so the
 * brand identity is consistent across the app without depending on a
 * raster asset (keeps the bundle slim and lets us recolor freely).
 *
 * Visual: "SOMNIO" in a wide-tracked sans wordmark, with a single
 * hairline diamond glyph between the "M" and "N" that nods to the
 * "Digital DNA" provenance theme.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { theme } from "@/src/theme";

export type HeaderLogoProps = {
  /** Wordmark height in points. Default 14 — sized to sit naturally in
   * a 22pt-line header bar. */
  size?: number;
  /** Override the fill colour (defaults to the rose-gold theme token). */
  color?: string;
  /** Sets a tag below the wordmark — e.g. "ATELIER" — at half the size. */
  tag?: string;
};

export function HeaderLogo({
  size = 12,
  color = theme.roseGold,
  tag,
}: HeaderLogoProps) {
  // Width is roughly 7.6x the height for the "SOMNIO" tracking we use.
  const width = Math.round(size * 7.6);
  const height = tag ? size + Math.round(size * 0.7) : size + 4;
  // Diamond glyph dimensions, sized relative to wordmark height.
  const dWidth = size * 0.30;
  const dHeight = size * 0.38;
  // Positions along the 100-unit logical x-axis. The wordmark is rendered
  // at viewBox 100×18 and scales to the configured size.
  const VB_W = 100;
  const VB_H = 18;
  const tagH = tag ? 10 : 0;
  return (
    <View
      accessibilityLabel="Somnio"
      style={[styles.wrap, { width, height: height + 2 }]}
    >
      <Svg
        width={width}
        height={height + 2}
        viewBox={`0 0 ${VB_W} ${VB_H + tagH}`}
      >
        <Defs>
          {/* Subtle rose-gold gradient gives the wordmark depth on dark
              backgrounds without competing with the champagne-gold UI. */}
          <LinearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={theme.roseGoldDim} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        {/* Wordmark.  Geometric sans, all caps, wide tracking. We use a
            solid fill so the rose-gold reads clearly at small sizes
            (SVG gradients on <text> are unreliable on RN-Web). */}
        <SvgText
          x={VB_W / 2}
          y={15}
          fill={color}
          fontSize="11"
          fontWeight="700"
          fontFamily="Helvetica, Arial, sans-serif"
          letterSpacing="2.4"
          textAnchor="middle"
        >
          SOMNIO
        </SvgText>
        {/* Single diamond glyph centered above the wordmark — a subtle
            mark that hints at the Digital DNA story. */}
        <Path
          d={`M ${VB_W / 2} 1 L ${VB_W / 2 + dWidth} ${dHeight / 2 + 1} L ${VB_W / 2} ${dHeight + 1} L ${VB_W / 2 - dWidth} ${dHeight / 2 + 1} Z`}
          fill="url(#rg)"
        />
        {tag ? (
          <SvgText
            x={VB_W / 2}
            y={VB_H + tagH - 1}
            fill={color}
            opacity={0.75}
            fontSize="5"
            fontWeight="500"
            fontFamily="Helvetica, Arial, sans-serif"
            letterSpacing="1.8"
            textAnchor="middle"
          >
            {tag}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default HeaderLogo;
