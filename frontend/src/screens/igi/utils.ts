/** IGI certificate format helpers. */
import type { CadFile } from "@/src/api/client";

// Document types we explicitly recognise for IGI certificates. Backend
// accepts any extension via Cloudinary raw upload, so we only colour-code
// the badge for clarity — never block an upload.
export const IGI_EXTS = new Set([
  "pdf", "jpg", "jpeg", "png", "heic", "webp", "tif", "tiff",
]);

export function extOf(file: CadFile): string {
  if (file.format) return file.format.toLowerCase();
  const i = file.name.lastIndexOf(".");
  if (i >= 0) return file.name.slice(i + 1).toLowerCase();
  return "?";
}
