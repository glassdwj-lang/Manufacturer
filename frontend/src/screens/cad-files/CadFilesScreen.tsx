/**
 * CadFilesScreen — orchestrator for the per-order CAD page.
 *
 * Was the 590-line `app/(app)/cad-files/[id].tsx` monolith. Decomposed
 * into:
 *   - hooks/useCadFilesScreen.ts (state + IO + actions)
 *   - components/CadFileRow.tsx  (row UI + contextual icon buttons)
 *   - format.ts                  (extension lookup + byte/date formatters)
 *   - styles.ts                  (shared StyleSheet)
 */
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";
import { EmailFilesModal } from "@/src/components/EmailFilesModal";
import { useI18n } from "@/src/i18n";

import { cadStyles as styles } from "./styles";
import { useCadFilesScreen } from "./hooks/useCadFilesScreen";
import { CadFileRow } from "./components/CadFileRow";

export default function CadFilesScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const orderId = String(params.id || "");
  const safeBack = useSafeBack(`/(app)/order/${orderId}`);
  const { t } = useI18n();
  const s = useCadFilesScreen(orderId);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity testID="cad-back" onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("cad_page.title")}</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.subhead}>
        {s.files.length} file{s.files.length === 1 ? "" : "s"} attached
        {s.pendingFiles.length > 0
          ? `  \u00b7  ${s.pendingFiles.length} pending`
          : ""}
      </Text>

      <TouchableOpacity
        testID="cad-upload-button"
        onPress={s.pickAndUpload}
        disabled={s.uploading}
        style={[styles.uploadBtn, s.uploading && styles.uploadBtnDim]}
      >
        {s.uploading ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <>
            <Ionicons
              name="cloud-upload-outline"
              size={16}
              color="#0A0A0A"
            />
            <Text style={styles.uploadBtnText}>{t("cad_page.upload")}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Email-forward CTA — only surfaced when there are approved files. */}
      {s.files.length > 0 && (
        <TouchableOpacity
          testID="cad-email-button"
          onPress={() => s.setEmailOpen(true)}
          style={styles.emailBtn}
        >
          <Ionicons name="mail-outline" size={16} color={theme.primary} />
          <Text style={styles.emailBtnText}>
            {`${t("cad_page.email")} (${s.files.length})`}
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={[]}
        renderItem={null as any}
        keyExtractor={() => ""}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: spacing.sm,
        }}
        refreshControl={
          <RefreshControl
            refreshing={s.refreshing}
            onRefresh={() => {
              s.setRefreshing(true);
              s.load();
            }}
            tintColor={theme.primary}
          />
        }
        ListHeaderComponent={
          <>
            {s.pendingFiles.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>
                  {t("cad_page.pending_section", {
                    n: s.pendingFiles.length,
                  })}
                </Text>
                <Text style={styles.sectionHint}>
                  {s.isReviewer
                    ? t("cad_page.pending_hint_admin")
                    : t("cad_page.pending_hint_vendor")}
                </Text>
                {s.pendingFiles.map((f) => (
                  <CadFileRow
                    key={f.id}
                    item={f}
                    isPending
                    isReviewer={s.isReviewer}
                    currentUserId={s.user?.id}
                    orderId={orderId}
                    onOpen={s.openFile}
                    onApprove={s.approveFile}
                    onReject={s.rejectFile}
                    onDelete={s.deleteFile}
                  />
                ))}
              </>
            )}
            {(s.files.length > 0 || s.pendingFiles.length > 0) && (
              <Text
                style={[
                  styles.sectionLabel,
                  s.pendingFiles.length > 0 && { marginTop: spacing.lg },
                ]}
              >
                {t("cad_page.live_section", { n: s.files.length })}
              </Text>
            )}
            {s.files.map((f) => (
              <CadFileRow
                key={f.id}
                item={f}
                isPending={false}
                isReviewer={s.isReviewer}
                currentUserId={s.user?.id}
                orderId={orderId}
                onOpen={s.openFile}
                onApprove={s.approveFile}
                onReject={s.rejectFile}
                onDelete={s.deleteFile}
              />
            ))}
            {s.loading && (
              <View style={{ paddingVertical: spacing.xxl }}>
                <ActivityIndicator color={theme.primary} />
              </View>
            )}
            {!s.loading &&
              s.files.length === 0 &&
              s.pendingFiles.length === 0 && (
                <Text style={styles.emptyText}>
                  {t("cad_page.empty_hint")}
                </Text>
              )}
          </>
        }
      />

      <EmailFilesModal
        visible={s.emailOpen}
        kind="cad"
        files={s.files}
        jewelryName={s.jewelryName}
        send={(payload) => api.emailCadFiles(orderId, payload)}
        onClose={() => s.setEmailOpen(false)}
      />
    </SafeAreaView>
  );
}
