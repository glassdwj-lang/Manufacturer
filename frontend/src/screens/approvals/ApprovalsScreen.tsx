/**
 * ApprovalsScreen — shell composing the moderation queue UI:
 *   • Header (back / title / purge)
 *   • Three-tab bar (pending / on-hold / recycled)
 *   • Admin-only associate-approval toggle
 *   • Scrollable list of ApprovalCard rows (with pull-to-refresh)
 *   • PhotoLightbox (also unlocks the "reviewed" gate for the tapped item)
 *   • MediaModerationModal (HOLD / REJECT email + state mutation)
 *
 * Heavy lifting is delegated to `useApprovalsQueue` and child components.
 * Keeps this file readable as a high-level layout document.
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/context/AuthContext";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { theme } from "@/src/theme";
import { PhotoLightbox } from "@/src/components/PhotoLightbox";
import { BrandStrip } from "@/src/components/BrandStrip";
import {
  MediaModerationModal,
  type ModerationKind,
} from "@/src/components/MediaModerationModal";
import { useI18n } from "@/src/i18n";

import { ApprovalCard } from "./ApprovalCard";
import { TabPill } from "./TabPill";
import { useApprovalsQueue } from "./useApprovalsQueue";
import { styles } from "./styles";
import type {
  ApprovalsTab,
  ModerationState,
  QueueItem,
} from "./types";

export default function ApprovalsScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { t } = useI18n();
  const { user } = useAuth();

  const canModerate = user?.role === "admin" || user?.role === "associate";
  const isAdmin = user?.role === "admin";

  const queue = useApprovalsQueue({ canModerate, isAdmin });

  // Re-fetch the queue every time the screen gains focus so admins
  // always see the latest pending uploads without pulling-to-refresh.
  // This addresses the "I uploaded photos but they don't appear in
  // admin for approving" UX gap: the data was queued correctly but the
  // approvals screen was holding a stale list from its initial load.
  useFocusEffect(
    useCallback(() => {
      if (canModerate) {
        queue.load();
      }
      // queue.load is stable across renders; keeping it out of the dep
      // array avoids a refresh loop when the queue state changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canModerate]),
  );

  const [tab, setTab] = useState<ApprovalsTab>("pending");
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [moderation, setModeration] = useState<ModerationState | null>(null);
  // Per-photo "reviewed" gate — see ApprovalCard for details.
  const [reviewedUrls, setReviewedUrls] = useState<Set<string>>(new Set());

  const markReviewed = (url: string) => {
    setReviewedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  const onInspect = (url: string) => {
    markReviewed(url);
    setLightboxUrls([url]);
    setLightboxIndex(0);
  };

  const openModerationModal = (kind: ModerationKind, it: QueueItem) => {
    setModeration({
      kind,
      target: {
        order_id: it.order_id,
        order_ref: it.order_ref,
        jewelry_name: it.jewelry_name,
        step_number: it.step_number,
        step_title: it.step_title,
        photo_url: it.photo_url,
        manufacturer_email: it.manufacturer_email,
        manufacturer_name: it.manufacturer_name || it.manufacturer_alias,
      },
    });
  };

  const visible: QueueItem[] =
    tab === "pending"
      ? queue.pending
      : tab === "on_hold"
        ? queue.onHold
        : queue.recycled;

  if (!canModerate) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <BrandStrip />
        <View style={styles.header}>
          <TouchableOpacity
            onPress={safeBack}
            hitSlop={12}
            testID="approvals-back"
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("approvals.title")}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.empty}>
          <Ionicons
            name="lock-closed-outline"
            size={28}
            color={theme.textMuted}
          />
          <Text style={styles.emptyText}>{t("approvals.access_denied")}</Text>
          <TouchableOpacity
            style={styles.backToHome}
            onPress={() => router.replace("/(app)")}
            testID="approvals-back-home"
          >
            <Text style={styles.backToHomeText}>
              {t("approvals.back_home")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={safeBack} hitSlop={12}>
          <Ionicons
            name="chevron-back"
            size={24}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MEDIA APPROVALS</Text>
        {isAdmin ? (
          <TouchableOpacity
            onPress={queue.purge}
            hitSlop={12}
            testID="purge-btn"
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={theme.textMuted}
            />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <View style={styles.tabs}>
        <TabPill
          label={t("approvals.tab.pending")}
          count={queue.pending.length}
          active={tab === "pending"}
          onPress={() => setTab("pending")}
        />
        <TabPill
          label={t("approvals.tab.on_hold")}
          count={queue.onHold.length}
          active={tab === "on_hold"}
          onPress={() => setTab("on_hold")}
        />
        <TabPill
          label={t("approvals.tab.recycled")}
          count={queue.recycled.length}
          active={tab === "recycled"}
          onPress={() => setTab("recycled")}
        />
      </View>

      {isAdmin && (
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>ASSOCIATE APPROVAL</Text>
            <Text style={styles.toggleHelp}>
              When ON, associates can moderate photos for the commissions they own.
            </Text>
          </View>
          <Switch
            testID="associate-approval-switch"
            value={!!queue.associateApprovalEnabled}
            onValueChange={queue.toggleAssociateApproval}
            disabled={
              queue.settingsBusy ||
              queue.associateApprovalEnabled === null
            }
            trackColor={{ false: theme.border, true: theme.primary }}
          />
        </View>
      )}

      {queue.loading && !queue.refreshing ? (
        <View style={styles.empty}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="checkmark-done-outline"
            size={28}
            color={theme.textMuted}
          />
          <Text style={styles.emptyText}>
            {tab === "pending"
              ? t("approvals.empty.pending")
              : tab === "on_hold"
                ? t("approvals.empty.on_hold")
                : t("approvals.empty.recycled")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={queue.refreshing}
              onRefresh={queue.onRefresh}
              tintColor={theme.primary}
            />
          }
        >
          {visible.map((item) => (
            <ApprovalCard
              key={`${item.order_id}-${item.step_number}-${item.photo_url}`}
              item={item}
              tab={tab}
              isAdmin={!!isAdmin}
              busyUrl={queue.busyUrl}
              reviewedUrls={reviewedUrls}
              onInspect={onInspect}
              onApprove={queue.approve}
              onHold={(it) => openModerationModal("hold", it)}
              onReject={(it) => openModerationModal("reject", it)}
              onReinstate={queue.reinstate}
            />
          ))}
        </ScrollView>
      )}

      <PhotoLightbox
        photos={lightboxUrls || []}
        visible={!!lightboxUrls}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxUrls(null)}
      />
      <MediaModerationModal
        visible={!!moderation}
        kind={moderation?.kind || "hold"}
        target={moderation?.target || null}
        onClose={() => setModeration(null)}
        onCompleted={() => {
          setModeration(null);
          queue.load();
        }}
      />
    </SafeAreaView>
  );
}
