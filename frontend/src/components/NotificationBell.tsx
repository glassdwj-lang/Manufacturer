/**
 * NotificationBell — small bell icon with unread badge.
 *
 * Behaviour:
 *   - Polls the unread count every 60s while mounted.
 *   - Tapping the bell pushes the dedicated `/notifications` screen.
 *   - The badge hides itself at zero and shows `9+` past 9.
 *
 * Stateless w.r.t. the auth context — relies on the caller to mount it
 * only when the user is signed in (the home header already does that).
 */
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { theme } from "@/src/theme";

export function NotificationBell({
  color = theme.textPrimary,
  size = 22,
  testID = "notification-bell",
}: {
  color?: string;
  size?: number;
  testID?: string;
}) {
  const router = useRouter();
  const [unread, setUnread] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      const res = await api.unreadNotificationCount();
      setUnread(res.unread_count || 0);
    } catch (_e) {
      // best-effort — never surface
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const badge =
    unread > 9 ? "9+" : unread > 0 ? String(unread) : null;

  return (
    <TouchableOpacity
      onPress={() => router.push("/notifications" as any)}
      style={styles.wrap}
      testID={testID}
      hitSlop={6}
    >
      <Ionicons
        name={unread > 0 ? "notifications" : "notifications-outline"}
        size={size}
        color={color}
      />
      {badge && (
        <View style={styles.badge} testID={`${testID}-badge`}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#D9362C",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});

export default NotificationBell;
