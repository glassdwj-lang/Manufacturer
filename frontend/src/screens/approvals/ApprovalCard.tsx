/**
 * ApprovalCard — single row in the moderation queue. Renders the
 * thumbnail (or video poster), inspection badges, metadata, and action
 * pills. Locked until the moderator opens the image in the lightbox.
 */
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/src/theme";
import { isVideoUrl } from "@/src/api/cloudinaryUpload";
import { useI18n } from "@/src/i18n";

import { ActionButton } from "./ActionButton";
import { styles } from "./styles";
import type { ApprovalsTab, QueueItem } from "./types";
import { videoPoster } from "./utils";

export function ApprovalCard({
  item,
  tab,
  isAdmin,
  busyUrl,
  reviewedUrls,
  onInspect,
  onApprove,
  onHold,
  onReject,
  onReinstate,
}: {
  item: QueueItem;
  tab: ApprovalsTab;
  isAdmin: boolean;
  busyUrl: string | null;
  reviewedUrls: Set<string>;
  onInspect: (url: string) => void;
  onApprove: (it: QueueItem) => void;
  onHold: (it: QueueItem) => void;
  onReject: (it: QueueItem) => void;
  onReinstate: (it: QueueItem) => void;
}) {
  const { t } = useI18n();
  const url = item.photo_url;
  const thumb = isVideoUrl(url) ? videoPoster(url) : url;
  // Recycled rows are admin-only reinstate flows — no review-gate needed.
  const requiresReview = tab !== "recycled";
  const isReviewed = reviewedUrls.has(url);
  const locked = requiresReview && !isReviewed;

  return (
    <View style={styles.card}>
      <Pressable onPress={() => onInspect(url)} style={styles.thumbWrap}>
        <Image source={{ uri: thumb }} style={styles.thumb} />
        {isVideoUrl(url) && (
          <View style={styles.playPill}>
            <Ionicons name="play" size={14} color="#fff" />
          </View>
        )}
        {locked && (
          <View style={styles.reviewBadge}>
            <Ionicons name="eye" size={11} color="#FFFFFF" />
            <Text style={styles.reviewBadgeText}>TAP TO INSPECT</Text>
          </View>
        )}
        {!locked && requiresReview && (
          <View style={styles.reviewedBadge}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        )}
      </Pressable>
      <View style={styles.cardBody}>
        <Text style={styles.cardEyebrow}>
          {item.order_ref} · STEP {String(item.step_number).padStart(2, "0")} · PHASE {item.step_phase}
        </Text>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.step_title}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.client_name} · {item.jewelry_name}
        </Text>
        {!!item.manufacturer_alias && (
          <Text style={styles.cardMetaMuted}>{item.manufacturer_alias}</Text>
        )}
        {tab === "recycled" && (
          <Text style={styles.cardMetaMuted}>
            Rejected by {item.rejected_by || "—"} · {item.days_remaining ?? "?"} day(s) left
          </Text>
        )}
        {locked && (
          <Text style={styles.lockedHint}>
            Open the image to enable APPROVE / HOLD / REJECT.
          </Text>
        )}
        <View style={styles.actionsRow}>
          {tab !== "recycled" ? (
            <>
              <ActionButton
                label={t("approvals.approve")}
                color={theme.success}
                loading={busyUrl === url}
                disabled={locked}
                onPress={() => onApprove(item)}
              />
              {tab === "pending" && (
                <ActionButton
                  label={t("approvals.hold")}
                  color="#C28D3D"
                  loading={busyUrl === url}
                  disabled={locked}
                  onPress={() => onHold(item)}
                />
              )}
              <ActionButton
                label={t("approvals.reject")}
                color="#D9362C"
                filled
                loading={busyUrl === url}
                disabled={locked}
                onPress={() => onReject(item)}
              />
            </>
          ) : (
            isAdmin && (
              <ActionButton
                label={t("approvals.reinstate")}
                color={theme.primary}
                loading={busyUrl === url}
                onPress={() => onReinstate(item)}
              />
            )
          )}
        </View>
      </View>
    </View>
  );
}
