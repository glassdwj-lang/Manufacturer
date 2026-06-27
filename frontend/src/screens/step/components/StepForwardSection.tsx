/** Associate review-note + FORWARD-TO-CLIENT block. */
import React from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { theme } from "@/src/theme";
import { styles } from "../styles";

export function StepForwardSection({
  reviewNote,
  setReviewNote,
  saving,
  error,
  onForward,
}: {
  reviewNote: string;
  setReviewNote: (s: string) => void;
  saving: boolean;
  error: string | null;
  onForward: () => void;
}) {
  return (
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
        onPress={onForward}
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
  );
}
