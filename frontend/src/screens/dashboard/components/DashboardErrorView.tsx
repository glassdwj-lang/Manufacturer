/** Error / empty / forbidden state shown when the dashboard fetch fails. */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { BrandStrip } from "@/src/components/BrandStrip";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { styles } from "../styles";

export function DashboardErrorView({
  authExpired,
  forbidden,
  error,
  onRetry,
}: {
  authExpired: boolean;
  forbidden: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const safeBack = useSafeBack("/(app)");
  const router = useRouter();
  const { user, signOut } = useAuth();
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity testID="dashboard-back" onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DASHBOARD</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.center}>
        <Ionicons
          name={
            authExpired
              ? "lock-closed-outline"
              : forbidden
                ? "shield-outline"
                : "cloud-offline-outline"
          }
          size={28}
          color={theme.primary}
          style={{ marginBottom: spacing.md }}
        />
        <Text style={styles.errorTitle}>
          {authExpired
            ? "Session expired"
            : forbidden
              ? "Admin access required"
              : "Dashboard unavailable"}
        </Text>
        <Text style={styles.errorBody}>
          {authExpired
            ? "Please sign in again to refresh your access."
            : forbidden
              ? `The dashboard is restricted to Atelier admins. You're currently signed in as ${user?.role || "another role"}${
                  user?.email ? ` (${user.email})` : ""
                }.`
              : error || "We couldn't reach the server. Pull to retry."}
        </Text>
        <TouchableOpacity
          testID="dashboard-retry"
          onPress={() => {
            if (forbidden) {
              router.replace("/(app)");
              return;
            }
            onRetry();
          }}
          style={styles.retryBtn}
        >
          <Ionicons
            name={forbidden ? "home-outline" : "refresh"}
            size={16}
            color="#0A0A0A"
          />
          <Text style={styles.retryBtnText}>
            {forbidden ? "BACK TO HOME" : "RETRY"}
          </Text>
        </TouchableOpacity>
        {authExpired && (
          <TouchableOpacity
            testID="dashboard-signout"
            onPress={async () => {
              await signOut();
              router.replace("/login");
            }}
            style={[styles.retryBtn, styles.retryBtnSecondary]}
          >
            <Ionicons name="log-in-outline" size={16} color={theme.primary} />
            <Text style={[styles.retryBtnText, { color: theme.primary }]}>
              SIGN IN AGAIN
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
