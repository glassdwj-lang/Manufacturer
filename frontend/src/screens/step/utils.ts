/** Step-screen helpers. */

// Map manual-pick code → BCP47 tag + display name used when calling the
// /translate endpoint. Mirrors backend SUPPORTED_MANUAL_LANGS.
export const MANUAL_TARGETS: Record<string, { tag: string; name: string }> = {
  en: { tag: "en", name: "English" },
  zh: { tag: "zh-CN", name: "Chinese" },
  fr: { tag: "fr", name: "French" },
  it: { tag: "it", name: "Italian" },
};

/**
 * Build a Cloudinary thumbnail poster URL for a video asset. We swap the
 * extension to `.jpg` and inject a `so_1` (start-offset 1s) + `w_320`
 * transformation so the grid stays lightweight even with many clips.
 */
export function videoPoster(videoUrl: string): string {
  try {
    const parts = videoUrl.split("/video/upload/");
    if (parts.length !== 2) return videoUrl;
    const tail = parts[1].replace(/\.(mp4|mov|m4v|webm)(?=$|\?)/i, ".jpg");
    return `${parts[0]}/video/upload/so_1,w_320,h_320,c_fill,q_auto,f_jpg/${tail}`;
  } catch {
    return videoUrl;
  }
}

export function formatChinaTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}
