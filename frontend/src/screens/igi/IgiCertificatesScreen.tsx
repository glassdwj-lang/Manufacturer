/**
 * IgiCertificatesScreen — order's IGI certificate list with upload, in-app
 * preview, approval queue, and bulk-email actions.
 *
 * Sub-modules:
 *   • useIgiCertificates  — fetch + mutate state + uploads
 *   • IgiRow              — single-certificate row (thumb, badge, actions)
 *   • styles              — shared StyleSheet
 *   • utils               — extOf + IGI_EXTS
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api, CadFile } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";
import { useAuth } from "@/src/context/AuthContext";
import { CertificateViewerModal } from "@/src/components/CertificateViewerModal";
import { EmailFilesModal } from "@/src/components/EmailFilesModal";
import { useI18n } from "@/src/i18n";

import { IgiRow } from "./components/IgiRow";
import { useIgiCertificates } from "./useIgiCertificates";
import { styles } from "./styles";

export default function IgiCertificatesScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const orderId = String(params.id || "");
  const safeBack = useSafeBack(`/(app)/order/${orderId}`);
  const { user } = useAuth();
  const { t } = useI18n();

  const {
    files,
    pendingFiles,
    loading,
    refreshing,
    uploading,
    jewelryName,
    refresh,
    pickAndUpload,
    deleteFile,
    approveFile,
    rejectFile,
  } = useIgiCertificates(orderId);

  // Currently-previewed certificate (null = modal hidden).
  const [preview, setPreview] = useState<CadFile | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  // Access: admin, associate (pass-through), manufacturer (goes pending).
  // Other roles bounce home so they never see a 403.
  useEffect(() => {
    if (
      user &&
      user.role !== "admin" &&
      user.role !== "associate" &&
      user.role !== "manufacturer"
    ) {
      router.replace("/(app)");
    }
  }, [user, router]);

  const openFile = useCallback((file: CadFile) => {
    // Replace the "open in new window" behaviour with an in-app
    // CertificateViewerModal so the user never leaves the commission.
    if (!file?.secure_url) return;
    setPreview(file);
  }, []);

  const isReviewer = user?.role === "admin" || user?.role === "associate";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity testID="igi-back" onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>IGI CERTIFICATES</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.subhead}>
        {files.length} certificate{files.length === 1 ? "" : "s"} attached
      </Text>

      <TouchableOpacity
        testID="igi-upload-button"
        onPress={pickAndUpload}
        disabled={uploading}
        style={[styles.uploadBtn, uploading && styles.uploadBtnDim]}
      >
        {uploading ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={16} color="#0A0A0A" />
            <Text style={styles.uploadBtnText}>UPLOAD IGI CERTIFICATES</Text>
          </>
        )}
      </TouchableOpacity>

      {files.length > 0 && (
        <TouchableOpacity
          testID="igi-email-button"
          onPress={() => setEmailOpen(true)}
          style={styles.emailBtn}
        >
          <Ionicons name="mail-outline" size={16} color={theme.primary} />
          <Text style={styles.emailBtnText}>
            EMAIL CERTIFICATES ({files.length})
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={[]}
        renderItem={null as any}
        keyExtractor={() => ""}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.primary}
          />
        }
        ListHeaderComponent={
          <>
            {pendingFiles.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>
                  {t("igi_page.pending_section", { n: pendingFiles.length })}
                </Text>
                <Text style={styles.sectionHint}>
                  {isReviewer
                    ? t("igi_page.pending_hint_admin")
                    : t("igi_page.pending_hint_vendor")}
                </Text>
                {pendingFiles.map((f) => (
                  <IgiRow
                    key={f.id}
                    item={f}
                    isPending={true}
                    isReviewer={isReviewer}
                    currentUserId={user?.id}
                    onOpen={openFile}
                    onApprove={approveFile}
                    onReject={rejectFile}
                    onDelete={deleteFile}
                  />
                ))}
              </>
            )}
            {(files.length > 0 || pendingFiles.length > 0) && (
              <Text
                style={[
                  styles.sectionLabel,
                  pendingFiles.length > 0 && { marginTop: spacing.lg },
                ]}
              >
                {t("igi_page.live_section", { n: files.length })}
              </Text>
            )}
            {files.map((f) => (
              <IgiRow
                key={f.id}
                item={f}
                isPending={false}
                isReviewer={isReviewer}
                currentUserId={user?.id}
                onOpen={openFile}
                onApprove={approveFile}
                onReject={rejectFile}
                onDelete={deleteFile}
              />
            ))}
            {loading && (
              <View style={{ paddingVertical: spacing.xxl }}>
                <ActivityIndicator color={theme.primary} />
              </View>
            )}
            {!loading && files.length === 0 && pendingFiles.length === 0 && (
              <Text style={styles.emptyText}>
                No certificates uploaded yet.
              </Text>
            )}
          </>
        }
      />

      {/* In-app full-screen preview — mirrors the photo lightbox so
          users have one consistent close affordance across the app. */}
      <CertificateViewerModal
        visible={!!preview}
        url={preview?.secure_url || null}
        title={preview?.name || null}
        onClose={() => setPreview(null)}
      />

      <EmailFilesModal
        visible={emailOpen}
        kind="igi"
        files={files}
        jewelryName={jewelryName}
        send={(payload) => api.emailIgiCertificates(orderId, payload)}
        onClose={() => setEmailOpen(false)}
      />
    </SafeAreaView>
  );
}
