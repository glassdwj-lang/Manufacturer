// Feature flags driven by EXPO_PUBLIC_* env vars (inlined at build time by Metro).
// Treat any falsy / "0" / "false" value as disabled.

function envBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

export const flags = {
  /** Show the Atelier Debug · Sample Data screen (seed buttons). Disable before production. */
  enableDebug: envBool(process.env.EXPO_PUBLIC_ENABLE_DEBUG),
};
