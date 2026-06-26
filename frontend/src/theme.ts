// Theme tokens for Somnio.Co Atelier (dark luxury + copper accent).
export const theme = {
  // Restored neutral dark surfaces — copper lives only on accents.
  bg: "#0A0A0A",
  surface: "#1A1A1A",
  surfaceElevated: "#242424",
  primary: "#A05A2A", // copper — deeper burnt-copper hue
  primaryDim: "#5E351A",
  roseGold: "#A05A2A",
  roseGoldDim: "#5E351A",
  secondary: "#A67C52",
  // Neutral whites for body text — high contrast on the dark surfaces.
  textPrimary: "#F5F5F5",
  textSecondary: "#A3A3A3",
  textMuted: "#6B6B6B",
  border: "#333333",
  borderSubtle: "#222222",
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
  cad_renderer: "CAD & Renderer",
};
