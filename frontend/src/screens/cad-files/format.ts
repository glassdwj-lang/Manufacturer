/**
 * CAD-specific format helpers + extension lookup. Co-located here so
 * both the screen and the future Renders/IGI per-order pages can share.
 */
import type { CadFile } from "@/src/api/client";

/** Extensions we explicitly colour-code as CAD payloads. Other formats
 *  still upload fine — the badge just renders in a muted style. */
export const CAD_EXTS = new Set([
  "stl", "obj", "3dm", "3ds", "step", "stp", "iges", "igs", "ipt",
  "dwg", "dxf", "x_t", "x_b", "sldprt", "sldasm", "prt", "asm",
  "gem", "matrix", "rhino", "skp", "blend", "fbx", "ply",
  "zip", "rar", "7z",
]);

export function formatBytes(b?: number | null): string {
  if (!b && b !== 0) return "\u2014";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function extOf(file: CadFile): string {
  if (file.format) return file.format.toLowerCase();
  const i = file.name.lastIndexOf(".");
  if (i >= 0) return file.name.slice(i + 1).toLowerCase();
  return "?";
}
