/**
 * Direct-from-client photo/video upload helper.
 *
 * For images we still resize/compress locally before pushing to Cloudinary.
 * For videos we upload the raw asset (Cloudinary handles transcoding +
 * adaptive streaming + auto-quality on delivery).
 *
 * The Cloudinary "secure_url" path itself tells us the type — image URLs
 * sit under ``/image/upload/`` and video URLs under ``/video/upload/``,
 * which we use everywhere downstream (UI grid, lightbox, PDF).
 */
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import { api } from "./client";

const CLOUDINARY_FOLDER_DEFAULT = "somnio/steps";

type SignPayload = {
  signature: string;
  api_key: string;
  cloud_name: string;
  timestamp: number;
  folder: string;
  public_id: string | null;
  tags: string | null;
  resource_type: string;
  upload_url: string;
};

async function fetchSignature(
  folder = CLOUDINARY_FOLDER_DEFAULT,
  resource_type: "image" | "video" = "image",
): Promise<SignPayload> {
  const res = await api.signCloudinaryUpload({ folder, resource_type });
  return res as SignPayload;
}

/** Best-effort client-side resize for images: keeps uploads small. */
async function compressImageForUpload(uri: string): Promise<{ uri: string; type: string }> {
  try {
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    return { uri: out.uri, type: "image/jpeg" };
  } catch {
    return { uri, type: "image/jpeg" };
  }
}

export interface UploadResult {
  secure_url: string;
}

export function isVideoUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return url.includes("/video/upload/");
}

async function postToCloudinary(
  sig: SignPayload,
  fileSpec: { uri: string; name: string; type: string },
): Promise<UploadResult> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(fileSpec.uri)).blob();
    form.append("file", blob, fileSpec.name);
  } else {
    form.append("file", {
      uri: fileSpec.uri,
      name: fileSpec.name,
      type: fileSpec.type,
    } as unknown as Blob);
  }
  form.append("api_key", sig.api_key);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);
  if (sig.tags) form.append("tags", sig.tags);

  const res = await fetch(sig.upload_url, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message || "Cloudinary upload failed");
  }
  return { secure_url: json.secure_url as string };
}

/** Upload a local image file URI (camera/library) to Cloudinary. */
export async function uploadLocalImage(localUri: string): Promise<UploadResult> {
  const sig = await fetchSignature(undefined, "image");
  const compressed = await compressImageForUpload(localUri);
  return postToCloudinary(sig, {
    uri: compressed.uri,
    name: "step-photo.jpg",
    type: compressed.type,
  });
}

/** Upload a local video file URI to Cloudinary. */
export async function uploadLocalVideo(localUri: string): Promise<UploadResult> {
  const sig = await fetchSignature(undefined, "video");
  // Derive a reasonable mime/extension from the URI; mp4 is the most common.
  const lower = localUri.toLowerCase();
  const ext = lower.endsWith(".mov")
    ? "mov"
    : lower.endsWith(".webm")
    ? "webm"
    : lower.endsWith(".m4v")
    ? "m4v"
    : "mp4";
  const type =
    ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4";
  return postToCloudinary(sig, {
    uri: localUri,
    name: `step-video.${ext}`,
    type,
  });
}

/** Upload an existing base64 data URI through the backend proxy. */
export async function uploadBase64Image(dataUri: string): Promise<UploadResult> {
  const res = await api.uploadBase64({ base64_data: dataUri });
  return res as UploadResult;
}

/** Convenience: handles both URI and base64 inputs for the legacy path. */
export async function uploadStepPhoto(input: { uri?: string; base64?: string }): Promise<UploadResult> {
  if (input.uri) return uploadLocalImage(input.uri);
  if (input.base64) {
    const dataUri = input.base64.startsWith("data:")
      ? input.base64
      : `data:image/jpeg;base64,${input.base64}`;
    return uploadBase64Image(dataUri);
  }
  throw new Error("uploadStepPhoto: neither uri nor base64 provided");
}

/** New media uploader that branches on asset kind. */
export async function uploadStepMedia(asset: {
  uri: string;
  type?: string | null; // expo-image-picker asset type: "image" | "video"
}): Promise<UploadResult> {
  if ((asset.type || "image").toLowerCase() === "video") {
    return uploadLocalVideo(asset.uri);
  }
  return uploadLocalImage(asset.uri);
}

/** Upload a CAD file (any extension) to Cloudinary as a "raw" asset.
 *
 * Cloudinary's "raw" resource_type stores the bytes verbatim — no
 * transcoding — so the secure_url we return can be downloaded with the
 * original extension intact. We thread the local filename through to the
 * Cloudinary upload form so the public_id reflects the source name
 * (e.g. "engagement-ring-v3.stl" instead of a random uuid).
 */
export async function uploadCadFile(asset: {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}): Promise<UploadResult & { name: string; bytes?: number; format?: string }> {
  const sig = await fetchSignature("somnio/cad", "raw");
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    form.append("file", blob, asset.name);
  } else {
    form.append("file", {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || "application/octet-stream",
    } as unknown as Blob);
  }
  form.append("api_key", sig.api_key);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);
  if (sig.tags) form.append("tags", sig.tags);
  const res = await fetch(sig.upload_url, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message || "Cloudinary upload failed");
  }
  // Cloudinary returns the original filename in ``original_filename`` (lower
  // case, no extension), and the format in ``format``. We prefer the name we
  // captured locally because it preserves casing + extension.
  return {
    secure_url: json.secure_url as string,
    name: asset.name,
    bytes: (json.bytes as number) || asset.size || undefined,
    format: (json.format as string) || extractExt(asset.name),
  };
}

/** Upload an IGI certificate (PDF/image) to Cloudinary as a raw asset
 * under the dedicated ``somnio/igi`` folder. Mirrors {@link uploadCustomsFile}.
 */
export async function uploadIgiCertFile(asset: {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}): Promise<UploadResult & { name: string; bytes?: number; format?: string }> {
  const sig = await fetchSignature("somnio/igi", "raw");
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    form.append("file", blob, asset.name);
  } else {
    form.append("file", {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || "application/octet-stream",
    } as unknown as Blob);
  }
  form.append("api_key", sig.api_key);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);
  if (sig.tags) form.append("tags", sig.tags);
  const res = await fetch(sig.upload_url, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message || "Cloudinary upload failed");
  }
  return {
    secure_url: json.secure_url as string,
    name: asset.name,
    bytes: (json.bytes as number) || asset.size || undefined,
    format: (json.format as string) || extractExt(asset.name),
  };
}

function extractExt(name: string): string | undefined {
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return undefined;
  return name.slice(i + 1).toLowerCase();
}

/** Upload a customs / airway-bill file (any type) to Cloudinary as a "raw"
 * asset under the ``somnio/customs`` folder. Mirrors {@link uploadCadFile}
 * but uses a separate folder so the asset library stays organised. */
export async function uploadCustomsFile(asset: {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}): Promise<UploadResult & { name: string; bytes?: number; format?: string }> {
  const sig = await fetchSignature("somnio/customs", "raw");
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    form.append("file", blob, asset.name);
  } else {
    form.append("file", {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || "application/octet-stream",
    } as unknown as Blob);
  }
  form.append("api_key", sig.api_key);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);
  if (sig.tags) form.append("tags", sig.tags);
  const res = await fetch(sig.upload_url, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message || "Cloudinary upload failed");
  }
  return {
    secure_url: json.secure_url as string,
    name: asset.name,
    bytes: (json.bytes as number) || asset.size || undefined,
    format: (json.format as string) || extractExt(asset.name),
  };
}
