/**
 * Direct-from-client photo upload helper.
 *
 * Asks the backend for a one-shot Cloudinary signature, then POSTs the file
 * straight to Cloudinary's REST endpoint. Returns the persistent
 * ``secure_url`` we then store on the step document.
 *
 * Falls back to the proxy ``/api/uploads/base64`` endpoint when the asset is
 * already a base64 data URI (e.g. on React Native Web where the picker may
 * not give us a file URI).
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
  upload_url: string;
};

async function fetchSignature(folder = CLOUDINARY_FOLDER_DEFAULT): Promise<SignPayload> {
  const res = await api.signCloudinaryUpload({ folder });
  return res as SignPayload;
}

/** Best-effort client-side resize: keeps uploads under ~1.5 MB on mobile. */
async function compressForUpload(uri: string): Promise<{ uri: string; type: string }> {
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

/** Upload a local file URI (from expo-image-picker / camera) to Cloudinary. */
export async function uploadLocalImage(localUri: string): Promise<UploadResult> {
  const sig = await fetchSignature();
  const compressed = await compressForUpload(localUri);

  const form = new FormData();
  // React Native FormData file shape: { uri, name, type }
  // On web, fetch a Blob from the URI to keep cross-platform parity.
  if (Platform.OS === "web") {
    const blob = await (await fetch(compressed.uri)).blob();
    form.append("file", blob, "step-photo.jpg");
  } else {
    form.append("file", {
      uri: compressed.uri,
      name: "step-photo.jpg",
      type: compressed.type,
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

/** Upload an existing base64 data URI through the backend proxy. */
export async function uploadBase64Image(dataUri: string): Promise<UploadResult> {
  const res = await api.uploadBase64({ base64_data: dataUri });
  return res as UploadResult;
}

/** Convenience: handles both URI and base64 inputs (used during the
 * incremental migration period). */
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
