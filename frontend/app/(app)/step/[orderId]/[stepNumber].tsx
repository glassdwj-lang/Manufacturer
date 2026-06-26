import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { uploadStepMedia, isVideoUrl } from "@/src/api/cloudinaryUpload";
import * as ImagePicker from "expo-image-picker";
import { api, Order, Step } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { confirmAction } from "@/src/utils/confirm";
import { LanguageSwitcher } from "@/src/components/LanguageSwitcher";
import { PhotoLightbox } from "@/src/components/PhotoLightbox";
import { useI18n } from "@/src/i18n";
import { BrandStrip } from "@/src/components/BrandStrip";

// Map manual-pick code → BCP47 tag + display name used when calling the
// /translate endpoint. Mirrors backend SUPPORTED_MANUAL_LANGS.
const MANUAL_TARGETS: Record<string, { tag: string; name: string }> = {
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
function videoPoster(videoUrl: string): string {
  try {
    const parts = videoUrl.split("/video/upload/");
    if (parts.length !== 2) return videoUrl;
    const tail = parts[1].replace(/\.(mp4|mov|m4v|webm)(?=$|\?)/i, ".jpg");
    return `${parts[0]}/video/upload/so_1,w_320,h_320,c_fill,q_auto,f_jpg/${tail}`;
  } catch {
    return videoUrl;
  }
}

export default function StepActionScreen() {
  const { orderId, stepNumber } = useLocalSearchParams<{ orderId: string; stepNumber: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user, languageVersion } = useAuth();
  const { t } = useI18n();
  const stepNum = parseInt(stepNumber || "0", 10);

  const [order, setOrder] = useState<Order | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Tracks active media uploads so we can disable the Save button until
  // all Cloudinary uploads complete (prevents saving with a stale empty
  // photos array, which used to make freshly-added photos vanish).
  const [uploadingCount, setUploadingCount] = useState(0);
  // When a manufacturer/admin taps "UPDATE" on a completed step, flip into
  // edit mode so the same notes/photos form is reused for the patch.
  const [editMode, setEditMode] = useState(false);
  // Manual on-demand translation state (the "Translate to X" button) — lets
  // a viewer translate a previously untranslated workshop note into their
  // currently-picked display language without touching the DB.
  const [manualTranslated, setManualTranslated] = useState<{
    notes: string;
    review: string;
    targetTag: string;
    targetName: string;
  } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const o = await api.getOrder(orderId);
      setOrder(o);
      const s = o.steps.find((x) => x.step_number === stepNum);
      if (s) {
        setStep(s);
        setNotes(s.notes || "");
        setPhotos(s.photos || []);
        setReviewNote(s.associate_review_note || "");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orderId, stepNum]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch when display language changes (step title / phase title
  // localize when STEP_I18N is keyed). Also clear any on-demand manual
  // translation so the new pick takes over.
  useEffect(() => {
    if (!loading) {
      setManualTranslated(null);
      setTranslateError(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageVersion]);

  const pickImage = async () => {
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
      if ((ImagePicker as any).MediaTypeOptions?.All && !Array.isArray((ImagePicker as any).MediaTypeOptions.All)) {
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
  };

  const removePhoto = (idx: number) => {
    setPhotos((p) => p.filter((_, i) => i !== idx));
  };

  const handleComplete = async () => {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    try {
      await api.completeStep(orderId, stepNum, notes, photos);
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateStep(orderId, stepNum, notes, photos);
      setEditMode(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    if (!orderId) return;
    confirmAction({
      title: "Remove completion?",
      message:
        "This step will be marked as not done and any forwarding will be reset. Your notes and photos are kept so you can resume.",
      confirmLabel: "Remove complete",
      destructive: true,
      onConfirm: async () => {
        setSaving(true);
        setError(null);
        try {
          await api.reopenStep(orderId, stepNum);
          await load();
        } catch (e: any) {
          setError(e?.message ?? "Failed");
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const handleForward = async () => {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    try {
      await api.forwardStep(orderId, stepNum, reviewNote);
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  // Manual on-demand translation. Uses the viewer's currently-picked
  // display language (`user.preferred_language` → MANUAL_TARGETS) and asks
  // the backend to translate the step's workshop note + associate review
  // note. Result is held in component state only — NOT persisted.
  const handleManualTranslate = async () => {
    if (!orderId || !step) return;
    const code = (user?.preferred_language || "").toLowerCase();
    const target = MANUAL_TARGETS[code];
    if (!target) {
      setTranslateError(
        "Pick a non-English display language from the header first."
      );
      return;
    }
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await api.translateStepNote(
        orderId,
        stepNum,
        target.tag,
        target.name
      );
      setManualTranslated({
        notes: res.notes_translated || step.notes || "",
        review:
          res.associate_review_note_translated ||
          step.associate_review_note ||
          "",
        targetTag: res.target_lang,
        targetName: res.target_lang_name,
      });
    } catch (e: any) {
      setTranslateError(e?.message ?? "Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  if (loading || !step || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isManufacturer = user?.role === "manufacturer" || user?.role === "admin";
  const isAssociate = user?.role === "associate" || user?.role === "admin";
  const isClient = user?.role === "client";
  const showCompleteFlow = isManufacturer && !step.completed;
  const showForwardFlow = isAssociate && step.completed && !step.forwarded_to_client;
  const canManufacturerEdit = isManufacturer && step.completed;
  const showFormFlow = showCompleteFlow || (canManufacturerEdit && editMode);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <BrandStrip />
      <View style={styles.headerBar}>
          <TouchableOpacity onPress={safeBack} testID="step-close" style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>{t("step.eyebrow", { n: String(stepNum).padStart(2, "0"), phase: step.phase })}</Text>
          </View>
          <LanguageSwitcher compact />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{step.title}</Text>
          {step.description ? <Text style={styles.desc}>{step.description}</Text> : null}

          {step.completed && step.completed_at_china && !isClient && (
            <View style={styles.timestampBox}>
              <Text style={styles.tsEyebrow}>COMPLETED · CHINA TIME (CST)</Text>
              <Text style={styles.tsValue}>{formatChinaTime(step.completed_at_china)}</Text>
              <Text style={styles.tsSub}>
                {step.forwarded_to_client ? "Forwarded to client" : "Awaiting associate forward"}
              </Text>
            </View>
          )}
          {step.completed && step.completed_at_china && isClient && (
            <View style={styles.timestampBox}>
              <Text style={styles.tsEyebrow}>COMPLETED</Text>
              <Text style={styles.tsValue}>{formatChinaTime(step.completed_at_china)}</Text>
              <Text style={styles.tsSub}>
                {step.forwarded_to_client ? "Received" : "Awaiting release"}
              </Text>
            </View>
          )}

          {showFormFlow ? (
            <>
              <Text style={styles.formLabel}>NOTES</Text>
              <TextInput
                testID="step-notes-input"
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes about this step..."
                placeholderTextColor={theme.textMuted}
                multiline
                style={[styles.input, { height: 90 }]}
              />

              <View style={styles.photosHeader}>
                <Text style={styles.formLabel}>PHOTOS</Text>
                <TouchableOpacity testID="add-photo-button" onPress={pickImage} style={styles.addPhotoBtn}>
                  <Ionicons name="camera-outline" size={16} color={theme.primary} />
                  <Text style={styles.addPhotoText}>ADD</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.photoGrid}>
                {photos.map((p, i) => (
                  <View key={i} style={styles.photoCell}>
                    <TouchableOpacity
                      testID={`open-photo-${i}`}
                      activeOpacity={0.85}
                      onPress={() => setLightboxIndex(i)}
                    >
                      <Image
                        source={{ uri: isVideoUrl(p) ? videoPoster(p) : p }}
                        style={styles.photoImg}
                      />
                      {isVideoUrl(p) && (
                        <View style={styles.playOverlay} pointerEvents="none">
                          <Ionicons name="play" size={20} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`remove-photo-${i}`}
                      onPress={() => removePhoto(i)}
                      style={styles.photoRemove}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {photos.length === 0 && uploadingCount === 0 && (
                  <View style={styles.photoEmpty}>
                    <Text style={styles.photoEmptyText}>No photos added</Text>
                  </View>
                )}
                {uploadingCount > 0 && (
                  <View style={styles.photoUploading} testID="photo-uploading">
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={styles.photoUploadingText}>
                      Uploading {uploadingCount}…
                    </Text>
                  </View>
                )}
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                testID={editMode ? "save-update-button" : "complete-step-button"}
                onPress={editMode ? handleUpdate : handleComplete}
                disabled={saving || uploadingCount > 0}
                style={[
                  styles.primaryBtn,
                  (saving || uploadingCount > 0) && { opacity: 0.6 },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#0A0A0A" />
                ) : uploadingCount > 0 ? (
                  <Text style={styles.primaryBtnText}>UPLOADING…</Text>
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {editMode ? "SAVE UPDATE" : "MARK STEP COMPLETE"}
                  </Text>
                )}
              </TouchableOpacity>
              {editMode && (
                <TouchableOpacity
                  testID="cancel-update-button"
                  onPress={() => {
                    setEditMode(false);
                    setNotes(step.notes || "");
                    setPhotos(step.photos || []);
                  }}
                  style={styles.secondaryBtn}
                  disabled={saving}
                >
                  <Text style={styles.secondaryBtnText}>CANCEL</Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}

          {showForwardFlow ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.formLabel}>ASSOCIATE REVIEW NOTE</Text>
              <TextInput
                testID="review-note-input"
                value={reviewNote}
                onChangeText={setReviewNote}
                placeholder="Add a note before forwarding to client..."
                placeholderTextColor={theme.textMuted}
                multiline
                style={[styles.input, { height: 70 }]}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity
                testID="forward-step-button"
                onPress={handleForward}
                disabled={saving}
                style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
              >
                {saving ? (
                  <ActivityIndicator color="#0A0A0A" />
                ) : (
                  <Text style={styles.primaryBtnText}>FORWARD TO CLIENT</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          {/* Read-only view for already-completed / forwarded */}
          {step.completed && !showForwardFlow && !showFormFlow && (
            <>
              {(() => {
                const code = (user?.preferred_language || "").toLowerCase();
                const target = MANUAL_TARGETS[code];
                const isNonEnglish = !!target && !target.tag.toLowerCase().startsWith("en");
                const hasNote = !!step.notes;
                // Step's auto-translation is for this language already? skip.
                const alreadyAutoMatches =
                  !!step.notes_target_lang &&
                  target &&
                  step.notes_target_lang.toLowerCase() === target.tag.toLowerCase();
                // Show when the viewer picked a non-English language and there
                // is no matching pre-baked translation available. Useful for
                // admins / associates / manufacturers viewing notes left by
                // someone else, where the auto-translation only ran against
                // the client's country (and may be empty for that viewer).
                const canManualTranslate =
                  isNonEnglish && hasNote && !alreadyAutoMatches && !manualTranslated;
                if (!canManualTranslate) return null;
                return (
                  <TouchableOpacity
                    testID="manual-translate-button"
                    onPress={handleManualTranslate}
                    disabled={translating}
                    style={[styles.translateBtn, translating && { opacity: 0.6 }]}
                  >
                    {translating ? (
                      <ActivityIndicator color={theme.primary} />
                    ) : (
                      <>
                        <Ionicons
                          name="language-outline"
                          size={14}
                          color={theme.primary}
                        />
                        <Text style={styles.translateBtnText}>
                          TRANSLATE TO {target!.name.toUpperCase()}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })()}
              {!!translateError && (
                <Text style={styles.errorText}>{translateError}</Text>
              )}
              {!!manualTranslated && !!manualTranslated.notes && (
                <>
                  <Text style={styles.formLabel}>
                    WORKSHOP NOTES · {manualTranslated.targetName.toUpperCase()}
                  </Text>
                  <Text style={styles.readonlyBlock}>{manualTranslated.notes}</Text>
                </>
              )}
              {!!(step.notes_translated && step.notes_translated !== step.notes) && (
                <>
                  <Text style={styles.formLabel}>WORKSHOP NOTES</Text>
                  <Text style={styles.readonlyBlock}>{step.notes_translated}</Text>
                  {!!step.notes && !isClient && (
                    <TouchableOpacity
                      testID="toggle-original-note"
                      onPress={() => setShowOriginal((v) => !v)}
                      style={styles.viewOriginalBtn}
                    >
                      <Ionicons
                        name={showOriginal ? "eye-off-outline" : "eye-outline"}
                        size={14}
                        color={theme.primary}
                      />
                      <Text style={styles.viewOriginalText}>
                        {showOriginal ? "HIDE ORIGINAL" : "VIEW ORIGINAL"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showOriginal && !!step.notes && !isClient && (
                    <Text style={[styles.readonlyBlock, styles.originalBlock]}>{step.notes}</Text>
                  )}
                </>
              )}
              {!step.notes_translated && !!step.notes && (
                <>
                  <Text style={styles.formLabel}>WORKSHOP NOTES</Text>
                  <Text style={styles.readonlyBlock}>{step.notes}</Text>
                </>
              )}
              {!!step.associate_review_note && (
                <>
                  <Text style={styles.formLabel}>ASSOCIATE NOTE</Text>
                  <Text style={styles.readonlyBlock}>
                    {manualTranslated && manualTranslated.review
                      ? manualTranslated.review
                      : step.associate_review_note_translated
                      ? step.associate_review_note_translated
                      : step.associate_review_note}
                  </Text>
                </>
              )}
              {photos.length > 0 && (
                <>
                  <Text style={styles.formLabel}>PHOTOS</Text>
                  <View style={styles.photoGrid}>
                    {photos.map((p, i) => (
                      <TouchableOpacity
                        key={i}
                        testID={`open-readonly-photo-${i}`}
                        activeOpacity={0.85}
                        onPress={() => setLightboxIndex(i)}
                        style={styles.photoCell}
                      >
                        <Image
                          source={{ uri: isVideoUrl(p) ? videoPoster(p) : p }}
                          style={styles.photoImg}
                        />
                        {isVideoUrl(p) && (
                          <View style={styles.playOverlay} pointerEvents="none">
                            <Ionicons name="play" size={20} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {/* Manufacturer / admin amendments on an already-finalised step */}
              {canManufacturerEdit && (
                <View style={styles.mfgAmendRow}>
                  <TouchableOpacity
                    testID="enter-update-button"
                    onPress={() => setEditMode(true)}
                    style={styles.secondaryBtn}
                    disabled={saving}
                  >
                    <Ionicons name="create-outline" size={14} color={theme.primary} />
                    <Text style={styles.secondaryBtnText}>UPDATE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="reopen-step-button"
                    onPress={handleReopen}
                    style={styles.dangerBtn}
                    disabled={saving}
                  >
                    <Ionicons name="close-circle-outline" size={14} color={theme.danger} />
                    <Text style={styles.dangerBtnText}>REMOVE COMPLETE</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <PhotoLightbox
        photos={photos}
        visible={lightboxIndex !== null}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
    </SafeAreaView>
  );
}

function formatChinaTime(iso: string) {
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: spacing.sm,
  },
  iconBtn: { padding: 4, marginRight: spacing.sm },
  headerEyebrow: { color: theme.primary, fontSize: 11, letterSpacing: 3 },
  title: { color: theme.textPrimary, fontSize: 24, fontWeight: "300", marginTop: spacing.sm, lineHeight: 30 },
  desc: { color: theme.textSecondary, fontSize: 13, marginTop: spacing.sm, lineHeight: 20 },
  timestampBox: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: theme.primary,
    padding: spacing.md,
  },
  tsEyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  tsValue: { color: theme.textPrimary, fontSize: 16, marginTop: 4 },
  tsSub: { color: theme.textSecondary, fontSize: 11, marginTop: 4 },
  formLabel: { color: theme.primary, fontSize: 10, letterSpacing: 3, marginTop: spacing.lg, marginBottom: spacing.sm },
  input: {
    color: theme.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  photosHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg },
  addPhotoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: theme.primary, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  addPhotoText: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  photoCell: { width: 84, height: 84, position: "relative" },
  photoImg: { width: 84, height: 84, borderWidth: 1, borderColor: theme.border },
  playOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  photoRemove: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.7)", padding: 4 },
  photoEmpty: { width: "100%", padding: spacing.md, borderWidth: 1, borderColor: theme.border, borderStyle: "dashed" },
  photoEmptyText: { color: theme.textMuted, fontSize: 12, textAlign: "center" },
  photoUploading: {
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.primary,
    backgroundColor: "rgba(212, 175, 55, 0.08)",
    gap: 4,
  },
  photoUploadingText: {
    color: theme.primary,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "600",
  },
  errorText: { color: theme.error, fontSize: 12, marginTop: spacing.md },
  primaryBtn: { backgroundColor: theme.primary, paddingVertical: 16, alignItems: "center", marginTop: spacing.xl },
  primaryBtnText: { color: "#0A0A0A", fontSize: 12, fontWeight: "700", letterSpacing: 3 },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: spacing.lg },
  readonlyBlock: {
    color: theme.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    lineHeight: 19,
  },
  originalBlock: { marginTop: spacing.sm, borderColor: theme.borderSubtle, opacity: 0.7 },
  viewOriginalBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: spacing.sm, alignSelf: "flex-start",
  },
  viewOriginalText: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  // ---- Manual on-demand translate (CTA shown when viewer language differs
  // from the step's auto-translated language)
  translateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: theme.primary,
    alignSelf: "stretch",
    minHeight: 44,
  },
  translateBtnText: {
    color: theme.primary,
    fontSize: 11,
    letterSpacing: 2,
  },
  // ---- Amendment actions (manufacturer/admin on completed steps) ----
  mfgAmendRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.primary,
    minHeight: 44,
  },
  secondaryBtnText: {
    color: theme.primary,
    fontSize: 11,
    letterSpacing: 2,
  },
  dangerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.danger,
    minHeight: 44,
  },
  dangerBtnText: {
    color: theme.danger,
    fontSize: 11,
    letterSpacing: 2,
  },
});
