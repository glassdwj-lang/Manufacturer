import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";
import { useAuth } from "@/src/context/AuthContext";

type Dashboard = {
  commissions: { total: number; active: number; completed: number; by_phase: Record<string, number> };
  top_manufacturers: { id: string; name: string; alias: string; email: string; active_count: number }[];
  recent_activity: { id: string; at: string; actor_email: string; action: string }[];
  approvals_pending: number;
  missing_contacts: number;
  workshops_total: number;
  new_users: Record<string, number>;
  sync_status: { associate_sync: any; gem_gallery_meta: any };
  generated_at: string;
};

function relTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return iso;
  }
}

export default function DashboardScreen() {
  const safeBack = useSafeBack("/(app)");
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (e) {
      console.warn("dashboard", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ color: theme.textMuted }}>Dashboard unavailable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const c = data.commissions;
  const phaseEntries = Object.entries(c.by_phase || {});
  const maxPhase = Math.max(1, ...phaseEntries.map(([, v]) => v as number));
  const nu = data.new_users;

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
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={theme.primary}
          />
        }
      >
        {/* COMMISSIONS OVERVIEW */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>COMMISSIONS</Text>
          <View style={styles.statsRow}>
            <Stat label="ACTIVE" value={c.active} />
            <Stat label="COMPLETED" value={c.completed} />
            <Stat label="TOTAL" value={c.total} />
          </View>
          {phaseEntries.length > 0 && (
            <>
              <Text style={styles.cardSub}>BY PHASE</Text>
              <View style={{ gap: 6, marginTop: 6 }}>
                {phaseEntries.map(([k, v]) => (
                  <View key={k} style={styles.phaseRow}>
                    <Text style={styles.phaseLabel}>P{k}</Text>
                    <View style={styles.phaseBar}>
                      <View
                        style={[
                          styles.phaseBarFill,
                          { width: `${Math.round(((v as number) / maxPhase) * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.phaseValue}>{v as number}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* TOP MANUFACTURERS */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardEyebrow}>TOP WORKSHOPS</Text>
            <TouchableOpacity onPress={() => router.push("/(app)/users")}>
              <Text style={styles.cardLink}>VIEW ALL</Text>
            </TouchableOpacity>
          </View>
          {data.top_manufacturers.length === 0 ? (
            <Text style={styles.empty}>No commissions yet.</Text>
          ) : (
            data.top_manufacturers.map((m) => {
              // Admin sees the real business name first, with the alias
              // appended as a secondary label (so the alias is still legible
              // for cross-referencing). Other roles never reach this screen
              // today, but we guard just in case.
              const isAdmin = user?.role === "admin";
              const realName = m.name || "—";
              const alias = (m.alias || "").trim();
              const headline = isAdmin
                ? alias && alias !== realName
                  ? `${realName}  ·  ${alias}`
                  : realName
                : alias || realName;
              return (
                <View key={m.id} style={styles.workshopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workshopName} numberOfLines={1}>
                      {headline}
                    </Text>
                    <Text style={styles.workshopMeta} numberOfLines={1}>
                      {m.email}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID={`workshop-active-${m.id}`}
                    onPress={() =>
                      router.push({
                        pathname: "/(app)",
                        params: { mfg: m.id },
                      })
                    }
                    style={styles.workshopCountBox}
                  >
                    <Text style={styles.workshopCount}>{m.active_count}</Text>
                    <Text style={styles.workshopCountLabel}>ACTIVE</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* APPROVALS + MISSING CONTACTS (pending work tiles) */}
        <View style={styles.cardRow}>
          <TouchableOpacity
            style={[styles.miniCard, styles.miniCardWarn]}
            onPress={() => router.push("/(app)/approvals")}
          >
            <Ionicons name="hourglass-outline" size={20} color="#C8A044" />
            <Text style={styles.miniValue}>{data.approvals_pending}</Text>
            <Text style={styles.miniLabel}>PENDING APPROVALS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.miniCard}
            onPress={() => router.push("/(app)/users")}
          >
            <Ionicons name="alert-circle-outline" size={20} color={theme.primary} />
            <Text style={styles.miniValue}>
              {data.missing_contacts} / {data.workshops_total}
            </Text>
            <Text style={styles.miniLabel}>MISSING CONTACTS</Text>
          </TouchableOpacity>
        </View>

        {/* NEW USERS */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>NEW USERS</Text>
          <View style={[styles.statsRow, { marginTop: spacing.sm }]}>
            <View style={styles.newCol}>
              <Text style={styles.newColTitle}>CLIENTS</Text>
              <Text style={styles.newColPrimary}>{nu.client_7d}</Text>
              <Text style={styles.newColSub}>last 7d  ·  {nu.client_30d} in 30d</Text>
            </View>
            <View style={styles.newCol}>
              <Text style={styles.newColTitle}>WORKSHOPS</Text>
              <Text style={styles.newColPrimary}>{nu.manufacturer_7d}</Text>
              <Text style={styles.newColSub}>last 7d  ·  {nu.manufacturer_30d} in 30d</Text>
            </View>
            <View style={styles.newCol}>
              <Text style={styles.newColTitle}>ASSOCIATES</Text>
              <Text style={styles.newColPrimary}>{nu.associate_7d}</Text>
              <Text style={styles.newColSub}>last 7d  ·  {nu.associate_30d} in 30d</Text>
            </View>
          </View>
        </View>

        {/* RECENT ACTIVITY */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardEyebrow}>RECENT ACTIVITY</Text>
            <TouchableOpacity onPress={() => router.push("/(app)/activity-log")}>
              <Text style={styles.cardLink}>FULL LOG</Text>
            </TouchableOpacity>
          </View>
          {data.recent_activity.length === 0 ? (
            <Text style={styles.empty}>No activity recorded yet.</Text>
          ) : (
            data.recent_activity.map((r) => (
              <View key={r.id} style={styles.actRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actAction} numberOfLines={1}>{r.action}</Text>
                  <Text style={styles.actActor} numberOfLines={1}>{r.actor_email}</Text>
                </View>
                <Text style={styles.actTime}>{relTime(r.at)}</Text>
              </View>
            ))
          )}
        </View>

        {/* SYNC STATUS */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>SYSTEM SYNCS</Text>
          <SyncBlock
            title="ASSOCIATE / USER SYNC"
            schedule={data.sync_status.associate_sync.schedule?.description || "Daily"}
            lastRun={data.sync_status.associate_sync.last_run}
          />
          <SyncBlock
            title="GEM-GALLERY COUNTRY META"
            schedule={data.sync_status.gem_gallery_meta.schedule?.description || "Monthly"}
            lastRun={data.sync_status.gem_gallery_meta.last_run}
          />
        </View>

        <Text style={styles.generatedAt}>
          Generated {new Date(data.generated_at).toLocaleString()}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SyncBlock({
  title,
  schedule,
  lastRun,
}: {
  title: string;
  schedule: string;
  lastRun: any;
}) {
  const at = lastRun?.summary?.synced_at || lastRun?.at || lastRun?.finished_at;
  const ok = lastRun ? lastRun?.summary?.ok !== false : null;
  return (
    <View style={styles.syncBlock}>
      <View style={{ flex: 1 }}>
        <Text style={styles.syncTitle}>{title}</Text>
        <Text style={styles.syncSchedule}>{schedule}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {at ? (
          <Text style={styles.syncTime}>{relTime(at)}</Text>
        ) : (
          <Text style={styles.syncTime}>Never run</Text>
        )}
        {ok === true && (
          <Ionicons name="checkmark-circle" size={14} color="#48905C" />
        )}
        {ok === false && (
          <Ionicons name="warning" size={14} color="#C8553D" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: { color: theme.textPrimary, fontSize: 14, letterSpacing: 4, fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
  },
  cardRow: { flexDirection: "row", gap: spacing.md },
  cardEyebrow: { color: theme.primary, fontSize: 11, letterSpacing: 3, marginBottom: spacing.sm },
  cardSub: { color: theme.textMuted, fontSize: 10, letterSpacing: 2, marginTop: spacing.md },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLink: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statBox: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderWidth: 1, borderColor: theme.border },
  statValue: { color: theme.primary, fontSize: 24, fontWeight: "700" },
  statLabel: { color: theme.textMuted, fontSize: 9, letterSpacing: 2, marginTop: 2 },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  phaseLabel: { color: theme.textMuted, fontSize: 10, width: 28, letterSpacing: 1 },
  phaseBar: { flex: 1, height: 6, backgroundColor: theme.border },
  phaseBarFill: { height: 6, backgroundColor: theme.primary },
  phaseValue: { color: theme.textPrimary, fontSize: 11, width: 24, textAlign: "right" },
  workshopRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: theme.border },
  workshopName: { color: theme.textPrimary, fontSize: 13, fontWeight: "600" },
  workshopMeta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  workshopCountBox: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.primary, marginLeft: spacing.sm },
  workshopCount: { color: theme.primary, fontSize: 16, fontWeight: "700" },
  workshopCountLabel: { color: theme.primary, fontSize: 8, letterSpacing: 1 },
  miniCard: { flex: 1, borderWidth: 1, borderColor: theme.border, padding: spacing.md, alignItems: "flex-start", gap: 4 },
  miniCardWarn: { borderColor: "#C8A044" },
  miniValue: { color: theme.textPrimary, fontSize: 22, fontWeight: "700" },
  miniLabel: { color: theme.textMuted, fontSize: 9, letterSpacing: 2 },
  newCol: { flex: 1, alignItems: "center", paddingVertical: spacing.sm },
  newColTitle: { color: theme.textMuted, fontSize: 9, letterSpacing: 2 },
  newColPrimary: { color: theme.primary, fontSize: 22, fontWeight: "700", marginTop: 4 },
  newColSub: { color: theme.textMuted, fontSize: 9, marginTop: 2, textAlign: "center" },
  actRow: { flexDirection: "row", paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border },
  actAction: { color: theme.textPrimary, fontSize: 12 },
  actActor: { color: theme.textMuted, fontSize: 10, marginTop: 1 },
  actTime: { color: theme.textMuted, fontSize: 10, marginLeft: 8 },
  syncBlock: { flexDirection: "row", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: theme.border, alignItems: "center" },
  syncTitle: { color: theme.textPrimary, fontSize: 12, fontWeight: "600" },
  syncSchedule: { color: theme.textMuted, fontSize: 10, marginTop: 2 },
  syncTime: { color: theme.textSecondary, fontSize: 11 },
  empty: { color: theme.textMuted, fontSize: 11, paddingVertical: spacing.sm, fontStyle: "italic" },
  generatedAt: { color: theme.textMuted, fontSize: 10, textAlign: "center", marginTop: spacing.lg, fontStyle: "italic" },
});
