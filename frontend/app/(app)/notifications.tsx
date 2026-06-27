/**
 * Notifications inbox — full-screen list of in-app notifications for the
 * current user. Tapping a row marks it read and deep-links to the source
 * screen (CAD page, Render page, etc.). "MARK ALL READ" clears badge.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  link_route: string | null;
  link_params: Record<string, any> | null;
  payload: Record<string, any> | null;
  created_at: string;
  read_at: string | null;
};

function iconFor(type: string): keyof typeof Ionicons.glyphMap {
  if (type.startsWith("cad.")) return "cube-outline";
  if (type.startsWith("render.")) return "images-outline";
  if (type.startsWith("photo.")) return "camera-outline";
  return "notifications-outline";
}

function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch {
    return iso;
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const safeBack = useSafeBack("/(app)");
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.listNotifications({ limit: 100 });
      setItems(res.items as Notif[]);
      setUnread(res.unread_count);
    } catch (e) {
      console.warn("[notifications]", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tapRow = async (n: Notif) => {
    if (!n.read_at) {
      try {
        await api.markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((p) =>
            p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p,
          ),
        );
        setUnread((u) => Math.max(0, u - 1));
      } catch (e) {
        console.warn("[notif-read]", e);
      }
    }
    if (n.link_route) {
      // expo-router accepts a route + params object; if our notification
      // baked dynamic segments into the route (e.g. /cad-files/[id]),
      // we substitute them inline from link_params.
      let target = n.link_route;
      const params = n.link_params || {};
      Object.entries(params).forEach(([k, v]) => {
        target = target.replace(`[${k}]`, String(v));
      });
      router.push(target as any);
    }
  };

  const markAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setItems((prev) =>
        prev.map((p) =>
          p.read_at ? p : { ...p, read_at: new Date().toISOString() },
        ),
      );
      setUnread(0);
    } catch (e) {
      console.warn("[notif-mark-all]", e);
    }
  };

  const removeRow = async (id: string) => {
    try {
      await api.deleteNotification(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      console.warn("[notif-delete]", e);
    }
  };

  const renderItem = ({ item }: { item: Notif }) => {
    const isUnread = !item.read_at;
    return (
      <TouchableOpacity
        onPress={() => tapRow(item)}
        style={[styles.row, isUnread && styles.rowUnread]}
        testID={`notif-row-${item.id}`}
        activeOpacity={0.7}
      >
        <View style={styles.iconWrap}>
          <Ionicons
            name={iconFor(item.type)}
            size={20}
            color={isUnread ? theme.primary : theme.textMuted}
          />
          {isUnread && <View style={styles.unreadDot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => removeRow(item.id)}
          style={styles.deleteBtn}
          testID={`notif-delete-${item.id}`}
          hitSlop={8}
        >
          <Ionicons name="close" size={16} color={theme.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity onPress={safeBack} testID="notif-back">
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>NOTIFICATIONS</Text>
        <TouchableOpacity
          onPress={markAll}
          disabled={unread === 0}
          testID="notif-mark-all"
          hitSlop={6}
        >
          <Text
            style={[
              styles.markAll,
              unread === 0 && { opacity: 0.35 },
            ]}
          >
            MARK ALL READ
          </Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={42} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>You're all caught up</Text>
          <Text style={styles.emptyBody}>
            New CAD or Render uploads will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={theme.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: theme.divider,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: theme.textPrimary,
    fontWeight: "700",
    letterSpacing: 3,
    fontSize: 13,
  },
  markAll: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: 8,
  },
  emptyTitle: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  emptyBody: { color: theme.textMuted, fontSize: 12, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: theme.bg,
  },
  rowUnread: { backgroundColor: "rgba(184, 115, 51, 0.06)" },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D9362C",
    borderWidth: 1,
    borderColor: theme.bg,
  },
  title: { color: theme.textPrimary, fontSize: 13, fontWeight: "500" },
  titleUnread: { fontWeight: "700" },
  body: { color: theme.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  time: { color: theme.textMuted, fontSize: 10, marginTop: 4, fontStyle: "italic" },
  deleteBtn: { padding: 4 },
  sep: { height: 1, backgroundColor: theme.divider, marginLeft: spacing.lg + 32 + spacing.md },
});
