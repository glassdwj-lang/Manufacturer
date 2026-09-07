/** Read-only view shown when a step is already completed (and possibly
 *  forwarded). Renders translated/original workshop notes, associate
 *  notes, the photo grid, the manual TRANSLATE button (when the viewer
 *  picked a non-English language with no pre-baked translation), and
 *  manufacturer/admin amendment actions. */
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import type { Step } from "@/src/api/client";
import { styles } from "../styles";
import { MANUAL_TARGETS } from "../utils";
import { PhotoGrid } from "./PhotoGrid";
import { StepNavBtn } from "./StepNavBtn";
import type { ManualTranslation } from "../useManualTranslate";

export function StepReadOnlyView({
  step,
  photos,
  isClient,
  preferredLanguage,
  manualTranslated,
  translating,
  translateError,
  onManualTranslate,
  onOpenLightbox,
  canManufacturerEdit,
  saving,
  onEnterEdit,
  onReopen,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onEmailPhotos,
}: {
  step: Step;
  photos: string[];
  isClient: boolean;
  preferredLanguage: string | undefined;
  manualTranslated: ManualTranslation | null;
  translating: boolean;
  translateError: string | null;
  onManualTranslate: () => void;
  onOpenLightbox: (idx: number) => void;
  canManufacturerEdit: boolean;
  saving: boolean;
  onEnterEdit: () => void;
  onReopen: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Admin / associate only — opens the EMAIL PHOTOS modal. When
   *  undefined the button is hidden (client / manufacturer view). */
  onEmailPhotos?: () => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);

  const code = (preferredLanguage || "").toLowerCase();
  const target = MANUAL_TARGETS[code];
  const isNonEnglish = !!target && !target.tag.toLowerCase().startsWith("en");
  const hasNote = !!step.notes;
  // Step's auto-translation is for this language already? skip.
  const alreadyAutoMatches =
    !!step.notes_target_lang &&
    target &&
    step.notes_target_lang.toLowerCase() === target.tag.toLowerCase();
  // Show when the viewer picked a non-English language and there is no
  // matching pre-baked translation available.
  const canManualTranslate =
    isNonEnglish && hasNote && !alreadyAutoMatches && !manualTranslated;

  return (
    <>
      {canManualTranslate && (
        <TouchableOpacity
          testID="manual-translate-button"
          onPress={onManualTranslate}
          disabled={translating}
          style={[styles.translateBtn, translating && { opacity: 0.6 }]}
        >
          {translating ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <>
              <Ionicons name="language-outline" size={14} color={theme.primary} />
              <Text style={styles.translateBtnText}>
                TRANSLATE TO {target!.name.toUpperCase()}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
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
            <Text style={[styles.readonlyBlock, styles.originalBlock]}>
              {step.notes}
            </Text>
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
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          }}>
            <Text style={styles.formLabel}>
              {step.pending_photos && step.pending_photos.length > 0
                ? `PHOTOS · APPROVED (${(step.photos || []).length})`
                : "PHOTOS"}
            </Text>
            {onEmailPhotos && (step.photos || []).length > 0 && (
              <TouchableOpacity
                testID="email-step-photos-button"
                onPress={onEmailPhotos}
                style={{
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 10, paddingVertical: 4,
                  borderWidth: 1, borderColor: theme.primary, borderRadius: 4,
                  marginBottom: 6,
                }}
              >
                <Ionicons name="mail-outline" size={12} color={theme.primary} style={{ marginRight: 4 }} />
                <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>
                  EMAIL
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <PhotoGrid
            photos={step.photos || []}
            uploadingCount={0}
            editable={false}
            onOpen={onOpenLightbox}
          />
        </>
      )}
      {/* Pending-approval photos shown in a clearly-badged section so
          the uploader can see their submission "landed" while it's
          awaiting admin review. Clients never see this section because
          backend strips pending_photos from their responses. */}
      {!isClient &&
        step.pending_photos &&
        step.pending_photos.length > 0 && (
          <>
            <View style={styles.pendingBadgeRow}>
              <Ionicons
                name="hourglass-outline"
                size={12}
                color={theme.primary}
              />
              <Text style={styles.pendingBadgeText}>
                PENDING ADMIN REVIEW ({step.pending_photos.length})
              </Text>
            </View>
            <Text style={styles.pendingBadgeHint}>
              These uploads are queued for atelier moderation — they
              become visible to the client once approved.
            </Text>
            <PhotoGrid
              photos={step.pending_photos}
              uploadingCount={0}
              editable={false}
              onOpen={(idx) =>
                // Offset by the number of approved photos so the
                // lightbox uses the merged photos prop layout.
                onOpenLightbox((step.photos || []).length + idx)
              }
            />
          </>
        )}
      {/* Manufacturer / admin amendments on an already-finalised step.
          Layout: two rows of two equal-width pills so the labels never
          get squeezed on a phone-width screen:
            Row 1 (actions)     : [UPDATE] [REMOVE COMPLETE]
            Row 2 (navigation)  : [PREVIOUS STEP] [NEXT STEP] */}
      {canManufacturerEdit && (
        <>
          <View style={styles.mfgAmendRow}>
            <TouchableOpacity
              testID="enter-update-button"
              onPress={onEnterEdit}
              style={styles.secondaryBtn}
              disabled={saving}
            >
              <Ionicons name="create-outline" size={14} color={theme.primary} />
              <Text style={styles.secondaryBtnText}>UPDATE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="reopen-step-button"
              onPress={onReopen}
              style={styles.dangerBtn}
              disabled={saving}
            >
              <Ionicons
                name="close-circle-outline"
                size={14}
                color={theme.danger}
              />
              <Text style={styles.dangerBtnText}>REMOVE COMPLETE</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.navOnlyRow}>
            <StepNavBtn
              direction="prev"
              disabled={!hasPrev}
              onPress={onPrev}
            />
            <StepNavBtn
              direction="next"
              disabled={!hasNext}
              onPress={onNext}
            />
          </View>
        </>
      )}
      {/* View-only consumers (client / associate / anyone without edit
          rights) get a 2-button PREV / NEXT row so they can still walk
          the protocol. */}
      {!canManufacturerEdit && (
        <View style={styles.navOnlyRow}>
          <StepNavBtn
            direction="prev"
            disabled={!hasPrev}
            onPress={onPrev}
          />
          <StepNavBtn
            direction="next"
            disabled={!hasNext}
            onPress={onNext}
          />
        </View>
      )}
    </>
  );
}
