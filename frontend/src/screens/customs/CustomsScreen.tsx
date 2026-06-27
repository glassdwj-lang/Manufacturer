/**
 * CustomsScreen — confidential airway-bill + customs document area.
 *
 * Sub-modules:
 *   • useCustoms             — fetch + state + uploads + removals + save
 *   • CustomsSectionHeader  — title/meta + upload button per section
 *   • CustomsFileList       — list of attached files with remove/open
 *   • styles                — shared StyleSheet
 *   • utils                 — extOf helper
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";
import { EmailFilesModal, EmailKind } from "@/src/components/EmailFilesModal";

import { CustomsSectionHeader } from "./components/CustomsSectionHeader";
import { CustomsFileList } from "./components/CustomsFileList";
import { useCustoms } from "./useCustoms";
import { styles } from "./styles";

export default function CustomsScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user } = useAuth();

  const {
    blob,
    airwayText,
    setAirwayText,
    notes,
    setNotes,
    loading,
    savingText,
    uploading,
    refreshing,
    error,
    jewelryName,
    refresh,
    pickAndUpload,
    openFile,
    removeFile,
    saveTextFields,
  } = useCustoms(orderId);

  // Which Email-files sheet is open. `null` keeps the modal hidden.
  const [emailKind, setEmailKind] = useState<EmailKind | null>(null);

  // Restrict the customs screen to roles that can either upload or view
  // documents: admin + manufacturer. Everyone else is bounced home.
  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "manufacturer") {
      router.replace("/(app)");
    }
  }, [user, router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const airwayFiles = blob?.airway_bill_files || [];
  const customsFiles = blob?.customs_files || [];
  const isAdmin = user?.role === "admin";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <BrandStrip />
        <View style={styles.headerBar}>
          <TouchableOpacity
            testID="customs-close"
            onPress={safeBack}
            style={{ padding: 4 }}
          >
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.headerEyebrow}>CUSTOMS · CONFIDENTIAL</Text>
            <Text style={styles.headerTitle}>Atelier Documents</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={theme.primary}
            />
          }
        >
          {/* ---------------------------- AIRWAY BILL ---------------------- */}
          <CustomsSectionHeader
            title="AIRWAY BILL"
            count={airwayFiles.length}
            uploading={uploading === "airway-bill"}
            onUpload={() => pickAndUpload("airway-bill")}
            testID="airway"
          />
          <CustomsFileList
            files={airwayFiles}
            kind="airway-bill"
            currentUserId={user?.id || ""}
            isAdmin={isAdmin}
            onOpen={openFile}
            onRemove={removeFile}
            emptyHint="No airway bills uploaded yet. Tap UPLOAD to attach PDF, image or any document."
          />

          {airwayFiles.length > 0 && (
            <TouchableOpacity
              testID="airway-email-button"
              onPress={() => setEmailKind("airway_bill")}
              style={styles.emailBtn}
            >
              <Ionicons name="mail-outline" size={16} color={theme.primary} />
              <Text style={styles.emailBtnText}>
                EMAIL AIRWAY BILL ({airwayFiles.length})
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.formLabel}>AIRWAY BILL — TEXT / TRACKING NUMBER</Text>
          <TextInput
            testID="airway-text-input"
            value={airwayText}
            onChangeText={setAirwayText}
            multiline
            placeholder="e.g. SQ-176-12345678, carrier, route, declared value..."
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { height: 80 }]}
          />

          <View style={{ height: spacing.xl }} />

          {/* ---------------------------- CUSTOMS DOCS --------------------- */}
          <CustomsSectionHeader
            title="CUSTOMS DOCUMENT"
            count={customsFiles.length}
            uploading={uploading === "customs"}
            onUpload={() => pickAndUpload("customs")}
            testID="customs"
          />
          <CustomsFileList
            files={customsFiles}
            kind="customs"
            currentUserId={user?.id || ""}
            isAdmin={isAdmin}
            onOpen={openFile}
            onRemove={removeFile}
            emptyHint="No customs documents uploaded yet. Tap UPLOAD to attach declarations, invoices, certificates."
          />

          {customsFiles.length > 0 && (
            <TouchableOpacity
              testID="customs-email-button"
              onPress={() => setEmailKind("customs")}
              style={styles.emailBtn}
            >
              <Ionicons name="mail-outline" size={16} color={theme.primary} />
              <Text style={styles.emailBtnText}>
                EMAIL CUSTOMS DOCS ({customsFiles.length})
              </Text>
            </TouchableOpacity>
          )}

          {isAdmin && (
            <>
              <Text style={styles.formLabel}>INTERNAL NOTES (ADMIN-ONLY)</Text>
              <TextInput
                testID="customs-notes-input"
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Tracking number, declared value, route, internal flags..."
                placeholderTextColor={theme.textMuted}
                style={[styles.input, { height: 100 }]}
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            testID="customs-save-button"
            onPress={saveTextFields}
            disabled={savingText}
            style={[styles.primaryBtn, savingText && { opacity: 0.6 }]}
          >
            {savingText ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={styles.primaryBtnText}>SAVE TEXT FIELDS</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <EmailFilesModal
        visible={emailKind !== null}
        kind={emailKind || "customs"}
        files={
          emailKind === "airway_bill" ? airwayFiles : customsFiles
        }
        jewelryName={jewelryName}
        send={(payload) =>
          api.emailCustomsFiles(
            orderId!,
            emailKind === "airway_bill" ? "airway-bill" : "customs",
            payload,
          )
        }
        onClose={() => setEmailKind(null)}
      />
    </SafeAreaView>
  );
}
