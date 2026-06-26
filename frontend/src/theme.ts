// Theme tokens for Somnio.Co Atelier (copper preview).
//
// To restore the champagne-gold palette, swap back to:
//   bg=#0A0A0A, surface=#1A1A1A, surfaceElevated=#242424,
//   primary=#D4AF37, primaryDim=#8B7128,
//   textPrimary=#F5F5F5, textSecondary=#A3A3A3, textMuted=#6B6B6B,
//   border=#333333, borderSubtle=#222222.
export const theme = {
  // Backgrounds — deep copper-tinted neutrals.
  bg: "#140A05",
  surface: "#22150B",
  surfaceElevated: "#2D1D11",
  primary: "#B87333", // copper — site-wide accent
  primaryDim: "#6E461F",
  roseGold: "#B87333", // kept as alias so the logo & accents stay synced
  roseGoldDim: "#6E461F",
  secondary: "#A67C52",
  // Text — warm copper-blush whites that read clearly on the copper bg.
  textPrimary: "#F5E5D2",
  textSecondary: "#D7B58F",
  textMuted: "#8E6A48",
  border: "#3D2918",
  borderSubtle: "#2A1B0E",
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
