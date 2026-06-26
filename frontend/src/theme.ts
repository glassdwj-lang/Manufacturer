// Theme tokens for Somnio.Co Atelier (rose-gold preview).
//
// To restore the champagne-gold palette, swap the values below back to:
//   bg=#0A0A0A, surface=#1A1A1A, surfaceElevated=#242424,
//   primary=#D4AF37, primaryDim=#8B7128,
//   textPrimary=#F5F5F5, textSecondary=#A3A3A3, textMuted=#6B6B6B,
//   border=#333333, borderSubtle=#222222.
export const theme = {
  // Backgrounds — dark rose-tinted neutrals. Just enough rose tint to
  // unify the surfaces with the rose-gold accents while preserving the
  // contrast WCAG demands for body content.
  bg: "#140A0C",
  surface: "#221316",
  surfaceElevated: "#2D1A1E",
  primary: "#B76E79", // rose gold — same color as the SOMNIO logo
  primaryDim: "#7E4C53",
  roseGold: "#B76E79",
  roseGoldDim: "#7E4C53",
  secondary: "#A67C52",
  // Text — blush-tinted whites that read as "rose gold" without losing
  // contrast on the dark rose backgrounds.
  textPrimary: "#F5E6E9",
  textSecondary: "#C9A8AE",
  textMuted: "#8E6970",
  border: "#3A2429",
  borderSubtle: "#2A1A1E",
  success: "#7BAE7F",
  successBg: "#1F3A2A",
  error: "#C97B7B",
  errorBg: "#3A1F1F",
  danger: "#C97B7B",
  warning: "#E0B062",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const typography = {
  serif: "CormorantGaramond_500Medium",
  serifBold: "CormorantGaramond_600SemiBold",
  sans: "Manrope_400Regular",
  sansMedium: "Manrope_500Medium",
  sansSemi: "Manrope_600SemiBold",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Atelier",
  manufacturer: "Workshop",
  associate: "Associate",
  client: "Maison Client",
};
