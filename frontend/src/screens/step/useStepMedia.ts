/** Image/video picker + Cloudinary upload + reorder helpers for a step. */
import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { uploadStepMedia } from "@/src/api/cloudinaryUpload";

export function useStepMedia(
  setPhotos: React.Dispatch<React.SetStateAction<string[]>>,
  setError: (e: string | null) => void,
) {
  // Tracks active media uploads so we can disable the Save button until
  // all Cloudinary uploads complete (prevents saving with a stale empty
  // photos array, which used to make freshly-added photos vanish).
  const [uploadingCount, setUploadingCount] = useState(0);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission denied.");
      return;
    }
    // expo-image-picker v17 prefers the `mediaTypes` array form. Falling
    // back to the legacy `MediaTypeOptions` enum keeps older SDKs working.
    let mediaTypes: any = ["images", "videos"];
    try {
      // The new array form is supported on SDK ≥ 49 / image-picker ≥ 15.
      // If not available, fall back to MediaTypeOptions.All.
      if (
        (ImagePicker as any).MediaTypeOptions?.All &&
        !Array.isArray((ImagePicker as any).MediaTypeOptions.All)
      ) {
        mediaTypes = (ImagePicker as any).MediaTypeOptions.All;
      }
    } catch {}
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (res.canceled) return;
    const assets = res.assets.filter((a) => !!a.uri);
    if (!assets.length) return;
    setError(null);
    setUploadingCount((n) => n + assets.length);
    try {
      const uploads = await Promise.all(
        assets.map(async (a) => {
          try {
            const r = await uploadStepMedia({ uri: a.uri, type: a.type });
            return r.secure_url;
          } catch (e) {
            console.warn("media upload failed", e);
            return null;
          } finally {
            setUploadingCount((n) => Math.max(0, n - 1));
          }
        }),
      );
      const urls = uploads.filter((u): u is string => !!u);
      if (urls.length) setPhotos((p) => [...p, ...urls]);
      if (urls.length < assets.length) {
        setError(`Failed to upload ${assets.length - urls.length} file(s).`);
      }
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    }
  }, [setPhotos, setError]);

  const removePhoto = useCallback(
    (idx: number) => {
      setPhotos((p) => p.filter((_, i) => i !== idx));
    },
    [setPhotos],
  );

  /**
   * Swap a photo/video between two positions in the array. Admin and
   * manufacturer use the chevron arrows on each tile to rearrange the
   * gallery; the new order is persisted on the next SAVE / COMPLETE call.
   */
  const movePhoto = useCallback(
    (from: number, to: number) => {
      setPhotos((current) => {
        if (
          from === to ||
          from < 0 ||
          to < 0 ||
          from >= current.length ||
          to >= current.length
        ) {
          return current;
        }
        const next = current.slice();
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      });
    },
    [setPhotos],
  );

  return { uploadingCount, pickImage, removePhoto, movePhoto };
}
