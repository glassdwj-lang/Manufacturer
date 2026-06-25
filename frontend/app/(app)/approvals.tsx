import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { isVideoUrl } from "@/src/api/cloudinaryUpload";
import { PhotoLightbox } from "@/src/components/PhotoLightbox";

type QueueItem = {
  order_id: string;
  order_ref: string;
  client_name: string;
  jewelry_name: string;
  manufacturer_alias?: string;
  step_number: number;
  step_title: string;
  step_phase: string;
  photo_url: string;
  status?: "pending" | "on_hold";
  rejected_by?: string;
  rejected_at?: string;
  days_remaining?: number | null;
};

type Tab = "pending" | "on_hold" | "recycled";

/**
 * Convert a Cloudinary video URL to a static jpg poster for grid display.
 * Falls back to the original URL if anything looks unexpected.
 */
function videoPoster(videoUrl: string): string {
  try {
    const parts = videoUrl.split("/video/upload/");
    if (parts.length !== 2) return videoUrl;
    const tail = parts[1].replace(/\.(mp4|mov|m4v|webm)(?=$|\?)/i, ".jpg");
    return `${parts[0]}/video/upload/so_1,w_320,h_320,c_fill,q_auto,f_jpg/${tail}`;
  } catch {
    return videoUrl;
  }
}

export default function ApprovalsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [recycled, setRecycled] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [associateApprovalEnabled, setAssociateApprovalEnabled] = useState<boolean | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  const canModerate = user?.role === "admin" || user?.role === "associate";
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    if (!canModerate) return;
    setLoading(true);
    try {
      const [queue, bin] = await Promise.all([
        api.listPendingPhotos(),
        api.listRecycledPhotos().catch(() => ({ items: [] })),
      ]);
      setItems(queue.items || []);
      setRecycled(bin.items || []);
      if (isAdmin) {
        try {
          const s = await api.getAppSettings();
          setAssociateApprovalEnabled(!!s.associate_approval_enabled);
        } catch {
          /* non-fatal */
        }
      }
    } catch (e) {
      console.warn("approvals load failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canModerate, isAdmin]);

  const toggleAssociateApproval = async (next: boolean) => {
    if (!isAdmin) return;
    setSettingsBusy(true);
    setAssociateApprovalEnabled(next); // optimistic
    try {
      const s = await api.updateAppSettings({ associate_approval_enabled: next });
      setAssociateApprovalEnabled(!!s.associate_approval_enabled);
    } catch (e) {
      console.warn("toggle associate approval failed", e);
      setAssociateApprovalEnabled(!next);
    } finally {
      setSettingsBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const pending = useMemo(() => items.filter((i) => i.status === "pending"), [items]);
  const onHold = useMemo(() => items.filter((i) => i.status === "on_hold"), [items]);

  const act = async (
    fn: () => Promise<unknown>,
    photoUrl: string,
  ) => {
    setBusyUrl(photoUrl);
    try {
      await fn();
      await load();
    } catch (e: any) {
      console.warn("approval action failed", e);
    } finally {
      setBusyUrl(null);
    }
  };

  const approve = (it: QueueItem) =>
    act(
      () =>
        api.approvePhoto({
          order_id: it.order_id,
          step_number: it.step_number,
          photo_url: it.photo_url,
        }),
      it.photo_url,
    );

  const hold = (it: QueueItem) =>
    act(
      () =>
        api.holdPhoto({
          order_id: it.order_id,
          step_number: it.step_number,
          photo_url: it.photo_url,
        }),
      it.photo_url,
    );

  const reject = (it: QueueItem) =>
    act(
      () =>
        api.rejectPhoto({
          order_id: it.order_id,
          step_number: it.step_number,
          photo_url: it.photo_url,
        }),
      it.photo_url,
    );

  const reinstate = (it: QueueItem) =>
    act(
      () =>
        api.reinstatePhoto({
          order_id: it.order_id,
          step_number: it.step_number,
          photo_url: it.photo_url,
        }),
      it.photo_url,
    );

  const handlePurge = async () => {
    try {
      const res = await api.purgeExpiredPhotos();
      console.log("purged", res);
      await load();
    } catch (e) {
      console.warn("purge failed", e);
    }
  };

  const visible: QueueItem[] =
    tab === "pending" ? pending : tab === "on_hold" ? onHold : recycled;

  const renderCard = (it: QueueItem) => {
    const url = it.photo_url;
    const thumb = isVideoUrl(url) ? videoPoster(url) : url;
    return (
      <View key={`${it.order_id}-${it.step_number}-${url}`} style={styles.card}>
        <Pressable
          onPress={() => {
            setLightboxUrls([url]);
            setLightboxIndex(0);
          }}
          style={styles.thumbWrap}
        >
          <Image source={{ uri: thumb }} style={styles.thumb} />
          {isVideoUrl(url) && (
            <View style={styles.playPill}>
              <Ionicons name="play" size={14} color="#fff" />
            </View>
          )}
        </Pressable>
        <View style={styles.cardBody}>
          <Text style={styles.cardEyebrow}>
            {it.order_ref} · STEP {String(it.step_number).padStart(2, "0")} · PHASE {it.step_phase}
          </Text>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {it.step_title}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {it.client_name} · {it.jewelry_name}
          </Text>
          {!!it.manufacturer_alias && (
            <Text style={styles.cardMetaMuted}>{it.manufacturer_alias}</Text>
          )}
          {tab === "recycled" && (
            <Text style={styles.cardMetaMuted}>
              Rejected by {it.rejected_by || "—"} · {it.days_remaining ?? "?"} day(s) left
            </Text>
          )}
          <View style={styles.actionsRow}>
            {tab !== "recycled" ? (
              <>
                <ActionButton
                  label="APPROVE"
                  color={theme.success}
                  loading={busyUrl === url}
                  onPress={() => approve(it)}
                />
                {tab === "pending" && (
                  <ActionButton
                    label="HOLD"
                    color="#C28D3D"
                    loading={busyUrl === url}
                    onPress={() => hold(it)}
                  />
                )}
                <ActionButton
                  label="REJECT"
                  color={theme.danger}
                  loading={busyUrl === url}
                  onPress={() => reject(it)}
                />
              </>
            ) : (
              isAdmin && (
                <ActionButton
                  label="REINSTATE"
                  color={theme.primary}
                  loading={busyUrl === url}
                  onPress={() => reinstate(it)}
                />
              )
            )}
          </View>
        </View>
      </View>
    );
  };

  if (!canModerate) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Only admins and associates can manage the approval queue.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MEDIA APPROVALS</Text>
        {isAdmin ? (
          <TouchableOpacity onPress={handlePurge} hitSlop={12} testID="purge-btn">
            <Ionicons name="trash-outline" size={20} color={theme.muted} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <View style={styles.tabs}>
        <TabPill
          label="Pending"
          count={pending.length}
          active={tab === "pending"}
          onPress={() => setTab("pending")}
        />
        <TabPill
          label="On Hold"
          count={onHold.length}
          active={tab === "on_hold"}
          onPress={() => setTab("on_hold")}
        />
        <TabPill
          label="Recycle Bin"
          count={recycled.length}
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
            value={!!associateApprovalEnabled}
            onValueChange={toggleAssociateApproval}
            disabled={settingsBusy || associateApprovalEnabled === null}
            trackColor={{ false: theme.border, true: theme.primary }}
          />
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.empty}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-outline" size={28} color={theme.muted} />
          <Text style={styles.emptyText}>
            {tab === "pending"
              ? "Nothing awaiting review."
              : tab === "on_hold"
              ? "No items on hold."
              : "Recycle bin is empty."}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
        >
          {visible.map(renderCard)}
        </ScrollView>
      )}

      <PhotoLightbox
        photos={lightboxUrls || []}
        visible={!!lightboxUrls}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxUrls(null)}
      />
    </SafeAreaView>
  );
}

function TabPill({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
      testID={`approvals-tab-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {count > 0 && (
        <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function ActionButton({
  label,
  color,
  loading,
  onPress,
}: {
  label: string;
  color: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { borderColor: color }]}
      onPress={onPress}
      disabled={loading}
      testID={`action-${label.toLowerCase()}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomColor: theme.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { color: theme.text, fontSize: 12, letterSpacing: 3, fontWeight: "700" },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
  },
  tabActive: { backgroundColor: theme.text, borderColor: theme.text },
  tabText: { color: theme.muted, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  tabTextActive: { color: theme.bg },
  tabBadge: {
    backgroundColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  tabBadgeActive: { backgroundColor: theme.bg },
  tabBadgeText: { color: theme.muted, fontSize: 10, fontWeight: "700" },
  tabBadgeTextActive: { color: theme.text },
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
  },
  thumbWrap: { width: 90, height: 90, position: "relative" },
  thumb: { width: 90, height: 90, backgroundColor: theme.border },
  playPill: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardBody: { flex: 1, gap: 2 },
  cardEyebrow: { color: theme.primary, fontSize: 9, letterSpacing: 2, fontWeight: "700" },
  cardTitle: { color: theme.text, fontSize: 14, fontWeight: "600" },
  cardMeta: { color: theme.muted, fontSize: 12 },
  cardMetaMuted: { color: theme.muted, fontSize: 10, letterSpacing: 1 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 999,
    minWidth: 78,
    alignItems: "center",
  },
  actionBtnText: { fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  emptyText: { color: theme.muted, textAlign: "center", fontSize: 12, letterSpacing: 1 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomColor: theme.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleLabel: { color: theme.primary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  toggleHelp: { color: theme.muted, fontSize: 11, marginTop: 2 },
});

// Silence unused Platform import if downstream ever drops platform branches.
void Platform;
