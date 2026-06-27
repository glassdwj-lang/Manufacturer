/**
 * DashboardScreen — admin overview composed of cards:
 *   • DateRangePresets   — global date filter (applies to every card below)
 *   • CommissionsCard    — active/completed/total + by-phase bars
 *   • HomeDailyChart     — atelier-wide daily activity
 *   • PendingTiles       — approvals + missing contacts shortcuts
 *   • NewUsersCard       — new users by role (range-aware)
 *   • TopWorkshopsCard   — most active manufacturers
 *   • RecentActivityCard — latest events with deep-link to log
 *   • SyncStatusCard     — background sync job health
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";
import { HomeDailyChart } from "@/src/components/HomeDailyChart";
import { useAuth } from "@/src/context/AuthContext";
import {
  DateRangePresets,
  EMPTY_DATE_RANGE,
  type DateRangeValue,
} from "@/src/screens/admin-library/DateRangePresets";

import { CommissionsCard } from "./components/CommissionsCard";
import { PendingTiles } from "./components/PendingTiles";
import { NewUsersCard } from "./components/NewUsersCard";
import { TopWorkshopsCard } from "./components/TopWorkshopsCard";
import { RecentActivityCard } from "./components/RecentActivityCard";
import { SyncStatusCard } from "./components/SyncStatusCard";
import { DashboardErrorView } from "./components/DashboardErrorView";
import { useDashboard } from "./useDashboard";
import { rangeCaptionFor } from "./utils";
import { styles } from "./styles";

export default function DashboardScreen() {
  const safeBack = useSafeBack("/(app)");
  const router = useRouter();
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRangeValue>(EMPTY_DATE_RANGE);
  const {
    data,
    loading,
    refreshing,
    error,
    authExpired,
    forbidden,
    load,
    onRefresh,
    setLoading,
  } = useDashboard(dateRange);

  // Hard guard: the dashboard is admin-only. If a non-admin somehow lands
  // here (deep link, browser history, etc.), bounce them home so they
  // never hit the 403 on the API and see a confusing error state.
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/(app)");
    }
  }, [user, router]);

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }
  if (!data) {
    return (
      <DashboardErrorView
        authExpired={authExpired}
        forbidden={forbidden}
        error={error}
        onRetry={() => {
          setLoading(true);
          load();
        }}
      />
    );
  }

  const rangeActive = !!(dateRange.date_from || dateRange.date_to);
  const rangeCaption = rangeActive ? rangeCaptionFor(dateRange) : "";

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

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* GLOBAL DATE FILTER — applies to commissions, top workshops,
            atelier pulse chart, and new-users counters. */}
        <DateRangePresets
          testID="dashboard-date-range"
          value={dateRange}
          onChange={setDateRange}
          labels={{ daily_report: "PERIOD" }}
        />
        {rangeActive && (
          <Text style={styles.filterCaption}>
            Filtering all dashboard data · {rangeCaption}
          </Text>
        )}

        <CommissionsCard data={data.commissions} />

        {/* Negative horizontal margin so the chart aligns to card width
            (the chart wraps itself with marginHorizontal: spacing.lg). */}
        <View
          style={{
            marginHorizontal: -spacing.lg,
            marginTop: -spacing.lg,
          }}
        >
          <HomeDailyChart
            externalRange={
              rangeActive
                ? {
                    date_from: dateRange.date_from,
                    date_to: dateRange.date_to,
                  }
                : null
            }
          />
        </View>

        <PendingTiles
          pendingApprovals={data.approvals_pending}
          missingContacts={data.missing_contacts}
          workshopsTotal={data.workshops_total}
        />

        <NewUsersCard
          newUsers={data.new_users}
          rangeActive={rangeActive}
          rangeCaption={rangeCaption}
        />

        <TopWorkshopsCard
          workshops={data.top_manufacturers}
          isAdmin={user?.role === "admin"}
        />

        <RecentActivityCard activity={data.recent_activity} />

        <SyncStatusCard syncs={data.sync_status} />

        <Text style={styles.generatedAt}>
          Generated {new Date(data.generated_at).toLocaleString()}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
