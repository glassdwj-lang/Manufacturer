/**
 * StepActionScreen — per-step view for a commission.
 *
 * Renders one of three flows depending on role & state:
 *   • Form flow         — manufacturer/admin completes or edits the step
 *   • Forward flow      — associate/admin adds a review note + forwards
 *   • Read-only         — anyone else sees the finalised notes/photos
 *
 * Sub-modules:
 *   • useStep                  — order/step fetch + complete/update/reopen/forward
 *   • useStepMedia             — image picker + uploads + reorder
 *   • useManualTranslate       — on-demand translation (non-persisted)
 *   • StepCompletionTimestamp  — "completed at" tile
 *   • StepFormSection          — notes/photo editor
 *   • StepForwardSection       — associate forward UI
 *   • StepReadOnlyView         — read-only notes/photos + amendments
 *   • PhotoGrid                — photo/video grid with editing affordances
 *   • styles + utils            — shared StyleSheet + helpers
 */
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { LanguageSwitcher } from "@/src/components/LanguageSwitcher";
import { PhotoLightbox } from "@/src/components/PhotoLightbox";
import { ReorderPhotosModal } from "@/src/components/ReorderPhotosModal";
import { EmailFilesModal, EmailFile } from "@/src/components/EmailFilesModal";
import { api } from "@/src/api/client";
import { useI18n } from "@/src/i18n";
import { BrandStrip } from "@/src/components/BrandStrip";

import { useStep } from "./useStep";
import { useStepMedia } from "./useStepMedia";
import { useManualTranslate } from "./useManualTranslate";
import { StepCompletionTimestamp } from "./components/StepCompletionTimestamp";
import { StepFormSection } from "./components/StepFormSection";
import { StepForwardSection } from "./components/StepForwardSection";
import { StepReadOnlyView } from "./components/StepReadOnlyView";
import { ClientApprovalGates } from "@/src/components/ClientApprovalGates";
import { styles } from "./styles";

export default function StepActionScreen() {
  const { orderId, stepNumber } = useLocalSearchParams<{
    orderId: string;
    stepNumber: string;
  }>();
  const safeBack = useSafeBack();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const stepNum = parseInt(stepNumber || "0", 10);

  // Prev / next step navigation — clamps to the 26-step protocol so the
  // chevrons disable at the boundaries instead of producing a 404.
  const TOTAL_STEPS = 26;
  const hasPrev = stepNum > 1;
  const hasNext = stepNum < TOTAL_STEPS;
  const goToStep = (n: number) => {
    if (!orderId) return;
    if (n < 1 || n > TOTAL_STEPS) return;
    // Use replace so the back-stack doesn't bloat as the user steps
    // through the protocol.
    router.replace(`/(app)/step/${orderId}/${n}`);
  };

  const {
    order,
    step,
    loading,
    saving,
    notes,
    setNotes,
    reviewNote,
    setReviewNote,
    photos,
    setPhotos,
    error,
    setError,
    editMode,
    setEditMode,
    handleComplete,
    handleUpdate,
    handleReopen,
    handleForward,
    cancelEdit,
  } = useStep(orderId, stepNum);

  const { uploadingCount, pickImage, removePhoto, movePhoto } = useStepMedia(
    setPhotos,
    setError,
  );

  const {
    manualTranslated,
    translating,
    translateError,
    handleManualTranslate,
  } = useManualTranslate(orderId, stepNum, step);

  const [reorderOpen, setReorderOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  // Admin / associate can email the approved photos of a completed
  // step to any recipient (client, customs broker, gemologist, etc.).
  // Step photos are stored as bare URL strings so we synthesize the
  // EmailFile[] on the fly — the backend rebuilds the same pseudo-file
  // dict from the photo array using the ``file_ids`` echo.
  const canEmailStepPhotos =
    (user?.role === "admin" || user?.role === "associate") &&
    !!step &&
    step.completed &&
    (step.photos || []).length > 0;

  const emailFiles: EmailFile[] = React.useMemo(() => {
    if (!step) return [];
    return (step.photos || []).map((_, idx) => ({
      id: `photo-${idx}`,
      name: `Step ${String(stepNum).padStart(2, "0")} · Photo ${idx + 1}`,
    }));
  }, [step, stepNum]);

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
  const showForwardFlow =
    isAssociate && step.completed && !step.forwarded_to_client;
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
          <TouchableOpacity
            onPress={safeBack}
            testID="step-close"
            style={styles.iconBtn}
          >
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>
              {t("step.eyebrow", {
                n: String(stepNum).padStart(2, "0"),
                phase: step.phase,
              })}
            </Text>
          </View>
          <LanguageSwitcher compact />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{step.title}</Text>
          {step.description ? (
            <Text style={styles.desc}>{step.description}</Text>
          ) : null}

          {!isClient && <StepCompletionTimestamp step={step} isClient={false} />}
          {isClient && <StepCompletionTimestamp step={step} isClient={true} />}

          {showFormFlow ? (
            <StepFormSection
              notes={notes}
              setNotes={setNotes}
              photos={photos}
              uploadingCount={uploadingCount}
              onPickImage={pickImage}
              onRemovePhoto={removePhoto}
              onMovePhoto={movePhoto}
              onOpenLightbox={setLightboxIndex}
              onReorder={() => setReorderOpen(true)}
              editMode={editMode}
              saving={saving}
              error={error}
              onPrimary={editMode ? handleUpdate : handleComplete}
              onCancel={cancelEdit}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={() => goToStep(stepNum - 1)}
              onNext={() => goToStep(stepNum + 1)}
            />
          ) : null}

          {showForwardFlow ? (
            <StepForwardSection
              reviewNote={reviewNote}
              setReviewNote={setReviewNote}
              saving={saving}
              error={error}
              onForward={handleForward}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={() => goToStep(stepNum - 1)}
              onNext={() => goToStep(stepNum + 1)}
            />
          ) : null}

          {step.completed && !showForwardFlow && !showFormFlow && (
            <StepReadOnlyView
              step={step}
              photos={photos}
              isClient={isClient}
              preferredLanguage={user?.preferred_language}
              manualTranslated={manualTranslated}
              translating={translating}
              translateError={translateError}
              onManualTranslate={handleManualTranslate}
              onOpenLightbox={setLightboxIndex}
              canManufacturerEdit={canManufacturerEdit}
              saving={saving}
              onEnterEdit={() => setEditMode(true)}
              onReopen={handleReopen}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={() => goToStep(stepNum - 1)}
              onNext={() => goToStep(stepNum + 1)}
              onEmailPhotos={canEmailStepPhotos ? () => setEmailOpen(true) : undefined}
            />
          )}

          {/* Step 02 (Conceptual Rendering) exposes the two-gate client
              approval strip. Admins see release toggles + read-only
              gate state; the client sees released renders + Accept /
              Revision / Gate-2 controls. Any other role sees nothing. */}
          {stepNum === 2 && (user?.role === "client" || user?.role === "admin" || user?.role === "associate") && (
            <ClientApprovalGates orderId={String(orderId)} role={user.role} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <PhotoLightbox
        photos={photos}
        visible={lightboxIndex !== null}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
      <ReorderPhotosModal
        visible={reorderOpen}
        photos={photos}
        onCancel={() => setReorderOpen(false)}
        onConfirm={(ordered) => {
          setPhotos(ordered);
          setReorderOpen(false);
        }}
      />
      <EmailFilesModal
        visible={emailOpen}
        kind="step_photos"
        files={emailFiles}
        jewelryName={order?.jewelry_name}
        send={(payload) =>
          api.emailStepPhotos(String(orderId), stepNum, payload)
        }
        onClose={() => setEmailOpen(false)}
      />
    </SafeAreaView>
  );
}
