/** Customs file format helpers. */
import type { CustomsFile } from "@/src/api/client";

export function extOf(file: CustomsFile): string {
  if (file.format) return file.format.toLowerCase();
  const i = file.name.lastIndexOf(".");
  if (i >= 0) return file.name.slice(i + 1).toLowerCase();
  return "?";
}
