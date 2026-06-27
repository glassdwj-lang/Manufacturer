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
          <Text style={styles.formLabel}>PHOTOS</Text>
          <PhotoGrid
            photos={photos}
            uploadingCount={0}
            editable={false}
            onOpen={onOpenLightbox}
          />
        </>
      )}
      {/* Manufacturer / admin amendments on an already-finalised step */}
      {canManufacturerEdit && (
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
            <Ionicons name="close-circle-outline" size={14} color={theme.danger} />
            <Text style={styles.dangerBtnText}>REMOVE COMPLETE</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}
