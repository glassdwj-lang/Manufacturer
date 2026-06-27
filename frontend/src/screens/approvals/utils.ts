/**
 * Convert a Cloudinary video URL to a static jpg poster for grid display.
 * Falls back to the original URL if anything looks unexpected.
 *
 * Example:
 *   in : https://res.cloudinary.com/xxx/video/upload/v1/foo.mp4
 *   out: https://res.cloudinary.com/xxx/video/upload/so_1,w_320,h_320,c_fill,q_auto,f_jpg/v1/foo.jpg
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
