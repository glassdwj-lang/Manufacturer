import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { api, Order } from "@/src/api/client";
import { theme, spacing, ROLE_LABELS } from "@/src/theme";
import { Eyebrow, ProgressBar, PhaseBadge } from "@/src/components/Ui";
import { flags } from "@/src/flags";

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.listOrders();
      setOrders(list);
    } catch (e) {
      console.warn("load orders", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.brandMark}>SOMNIO.CO · ATELIER</Text>
          <Text style={styles.welcome}>{roleLabel} · {user.name}</Text>
        </View>
        <TouchableOpacity testID="logout-button" onPress={signOut} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <Stat label="ACTIVE" value={String(orders.filter((o) => o.status === "in_progress").length)} />
        <Stat label="COMPLETED" value={String(orders.filter((o) => o.status === "completed").length)} />
        <Stat label="TOTAL" value={String(orders.length)} />
      </View>

      {(user.role === "admin" || user.role === "associate") && (
        <TouchableOpacity
          testID="create-order-button"
          style={styles.cta}
          onPress={() => router.push("/(app)/create-order")}
        >
          <Ionicons name="add" size={16} color="#0A0A0A" />
          <Text style={styles.ctaText}>NEW COMMISSION</Text>
        </TouchableOpacity>
      )}

      {user.role === "admin" && (
        <View style={styles.adminLinks}>
          <TouchableOpacity
            testID="manage-users-button"
            style={styles.linkBtn}
            onPress={() => router.push("/(app)/users")}
          >
            <Ionicons name="people-outline" size={16} color={theme.primary} />
            <Text style={styles.linkBtnText}>MANUFACTURERS · USERS</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </TouchableOpacity>
          {flags.enableDebug && (
            <TouchableOpacity
              testID="debug-button"
              style={[styles.linkBtn, { marginTop: spacing.sm }]}
              onPress={() => router.push("/(app)/debug")}
            >
              <Ionicons name="construct-outline" size={16} color={theme.primary} />
              <Text style={styles.linkBtnText}>ATELIER DEBUG · SAMPLE DATA</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <Eyebrow testID="orders-section-eyebrow">COMMISSIONS</Eyebrow>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No commissions yet</Text>
            <Text style={styles.emptyText}>
              {user.role === "admin" || user.role === "associate"
                ? "Tap NEW COMMISSION above to start one."
                : "Awaiting assignment from the atelier."}
            </Text>
          </View>
        }
        renderItem={({ item }) => <OrderCard order={item} onPress={() => router.push(`/(app)/order/${item.id}`)} />}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const completed = order.progress?.completed_count ?? 0;
  const total = order.progress?.total ?? 26;
  const currentStep = order.steps?.find((s) => !s.completed);
  return (
    <TouchableOpacity testID={`order-card-${order.id}`} onPress={onPress} style={styles.orderCard}>
      <View style={styles.orderCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderRef}>{order.order_ref}</Text>
          <Text style={styles.orderName}>{order.jewelry_name}</Text>
          <Text style={styles.orderSub}>
            {order.client_name} · {order.manufacturer_name}
          </Text>
        </View>
        {currentStep && <PhaseBadge phase={currentStep.phase} />}
      </View>
      <View style={styles.progressRow}>
        <ProgressBar current={completed} total={total} />
        <Text style={styles.progressText}>
          {completed} / {total}
        </Text>
      </View>
      {currentStep ? (
        <Text style={styles.currentStep}>Next · Step {currentStep.step_number} · {currentStep.title}</Text>
      ) : (
        <Text style={[styles.currentStep, { color: theme.success }]}>All 26 steps complete</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  centerFull: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { marginBottom: spacing.lg },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  brandMark: { color: theme.primary, fontSize: 10, letterSpacing: 3 },
  welcome: { color: theme.textPrimary, fontSize: 22, marginTop: 4, fontWeight: "400" },
  iconBtn: { padding: spacing.sm, borderWidth: 1, borderColor: theme.border },
  statsRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: spacing.lg,
  },
  stat: { flex: 1, padding: spacing.md, alignItems: "center", borderRightWidth: 1, borderRightColor: theme.border },
  statValue: { color: theme.primary, fontSize: 28, fontWeight: "300" },
  statLabel: { color: theme.textMuted, fontSize: 10, letterSpacing: 2, marginTop: 4 },
  cta: {
    backgroundColor: theme.primary,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: spacing.lg,
  },
  ctaText: { color: "#0A0A0A", fontSize: 12, letterSpacing: 3, fontWeight: "700" },
  adminLinks: { marginBottom: spacing.lg },
  linkBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  linkBtnText: { color: theme.textPrimary, fontSize: 12, letterSpacing: 2, flex: 1 },
  orderCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
  },
  orderCardTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md, gap: spacing.sm },
  orderRef: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  orderName: { color: theme.textPrimary, fontSize: 17, marginTop: 4, lineHeight: 22 },
  orderSub: { color: theme.textSecondary, fontSize: 12, marginTop: 4 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  progressText: { color: theme.textSecondary, fontSize: 11, letterSpacing: 1 },
  currentStep: { color: theme.textSecondary, fontSize: 12 },
  empty: { padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  emptyTitle: { color: theme.textPrimary, fontSize: 16, marginBottom: spacing.sm },
  emptyText: { color: theme.textSecondary, fontSize: 13, textAlign: "center" },
});
