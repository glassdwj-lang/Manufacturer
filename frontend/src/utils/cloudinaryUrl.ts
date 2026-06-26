/**
 * Small helpers around Cloudinary delivery URLs.
 *
 * The PDF-thumbnail trick: when an asset is uploaded as `raw` (which is
 * how we store CAD files / customs docs / IGI certificates), we can still
 * ask Cloudinary's image pipeline for a rasterised preview by swapping
 * `/raw/upload/` → `/image/upload/<transforms>/` and changing the `.pdf`
 * extension to `.jpg`. The `pg_1` transformation extracts the first page;
 * `f_jpg` + `q_auto` give us a web-sized JPEG.
 *
 * Works for any Cloudinary cloud — no SDK required.
 */

const PDF_EXT_RE = /\.pdf(\?[^#]*)?$/i;

/**
 * Build a JPEG thumbnail URL for a Cloudinary-hosted PDF. Returns `null`
 * for non-PDFs, non-Cloudinary URLs, or unrecognised URL shapes so the
 * caller can fall back to a regular extension-badge tile.
 */
export function cloudinaryPdfThumbnail(
  secureUrl: string | null | undefined,
  width = 220,
): string | null {
  if (!secureUrl) return null;
  if (!PDF_EXT_RE.test(secureUrl)) return null;
  // Only Cloudinary URLs follow the `/raw|image/upload/` segment shape.
  const m = secureUrl.match(/\/(raw|image)\/upload\/(.+)$/);
  if (!m || m.index == null) return null;
  const base = secureUrl.slice(0, m.index);
  const tail = m[2].replace(PDF_EXT_RE, ".jpg");
  const transforms = `f_jpg,pg_1,w_${width},q_auto:good`;
  return `${base}/image/upload/${transforms}/${tail}`;
}

/**
 * Detect whether a Cloudinary URL is renderable as an inline preview
 * image. PDFs are rasterisable via the helper above; common image
 * extensions are returned as-is.
 */
export function cloudinaryPreviewImage(
  secureUrl: string | null | undefined,
  width = 220,
): string | null {
  if (!secureUrl) return null;
  if (PDF_EXT_RE.test(secureUrl)) return cloudinaryPdfThumbnail(secureUrl, width);
  if (/\.(jpe?g|png|webp|gif|heic|heif|tiff?)(\?|$)/i.test(secureUrl)) {
    return secureUrl;
  }
  return null;
}
