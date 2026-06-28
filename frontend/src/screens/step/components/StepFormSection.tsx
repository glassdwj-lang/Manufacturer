/** Manufacturer/admin edit form — notes textarea + photo grid + complete
 *  or save button. Used for both initial completion AND the in-place
 *  update flow on already-finalised steps. */
import React from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { styles } from "../styles";
import { PhotoGrid } from "./PhotoGrid";
import { StepNavBtn } from "./StepNavBtn";

export function StepFormSection({
  notes,
  setNotes,
  photos,
  uploadingCount,
  onPickImage,
  onRemovePhoto,
  onMovePhoto,
  onOpenLightbox,
  onReorder,
  editMode,
  saving,
  error,
  onPrimary,
  onCancel,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  notes: string;
  setNotes: (s: string) => void;
  photos: string[];
  uploadingCount: number;
  onPickImage: () => void;
  onRemovePhoto: (idx: number) => void;
  onMovePhoto: (from: number, to: number) => void;
  onOpenLightbox: (idx: number) => void;
  onReorder: () => void;
  editMode: boolean;
  saving: boolean;
  error: string | null;
  onPrimary: () => void;
  onCancel: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
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
        <View style={{ flexDirection: "row", gap: 8 }}>
          {photos.length > 1 && (
            <TouchableOpacity
              testID="reorder-photos-button"
              onPress={onReorder}
              style={styles.addPhotoBtn}
            >
              <Ionicons name="swap-vertical" size={16} color={theme.primary} />
              <Text style={styles.addPhotoText}>REORDER</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            testID="add-photo-button"
            onPress={onPickImage}
            style={styles.addPhotoBtn}
          >
            <Ionicons name="camera-outline" size={16} color={theme.primary} />
            <Text style={styles.addPhotoText}>ADD</Text>
          </TouchableOpacity>
        </View>
      </View>

      <PhotoGrid
        photos={photos}
        uploadingCount={uploadingCount}
        editable={true}
        onOpen={onOpenLightbox}
        onRemove={onRemovePhoto}
        onMove={onMovePhoto}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        testID={editMode ? "save-update-button" : "complete-step-button"}
        onPress={onPrimary}
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
          onPress={onCancel}
          style={styles.secondaryBtn}
          disabled={saving}
        >
          <Text style={styles.secondaryBtnText}>CANCEL</Text>
        </TouchableOpacity>
      )}
      {/* Walk-the-protocol prev/next available below the primary action
          so the user can navigate without losing in-progress edits — the
          buttons stay disabled while saving so a mid-write nav is
          impossible. */}
      <View style={styles.navOnlyRow}>
        <StepNavBtn
          direction="prev"
          disabled={!hasPrev || saving}
          onPress={onPrev}
        />
        <StepNavBtn
          direction="next"
          disabled={!hasNext || saving}
          onPress={onNext}
        />
      </View>
    </>
  );
}
