import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Order } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { Eyebrow, ProgressBar, StatusPill } from "@/src/components/Ui";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { PhaseSection } from "@/src/components/order/PhaseSection";
import { DigitalDnaModal } from "@/src/components/DigitalDnaModal";
import { LanguageSwitcher } from "@/src/components/LanguageSwitcher";

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user, languageVersion } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ I: true });
  const [revealWorkshop, setRevealWorkshop] = useState(false);
  const [dnaModal, setDnaModal] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const o = await api.getOrder(id);
      setOrder(o);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch the order whenever the signed-in user changes their manual
  // display language so the 26-step phase titles localize instantly.
  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageVersion]);

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const phases = Array.from(new Set(order.steps.map((s) => s.phase)));
  const phaseTitleOf = (p: string) =>
    order.steps.find((s) => s.phase === p)?.phase_title ?? "";

  const canEditStep = user?.role === "manufacturer" || user?.role === "admin";
  const canForward = user?.role === "associate" || user?.role === "admin";

  const completed = order.progress?.completed_count ?? 0;
  const total = order.progress?.total ?? 26;
  const dnaUnlocked = completed >= total && total > 0;

  const isAdmin = user?.role === "admin";
  const aliasOrName = isAdmin
    ? order.manufacturer_alias || order.manufacturer_name
    : order.manufacturer_name;
  const workshopDisplay =
    isAdmin && revealWorkshop ? order.manufacturer_name : aliasOrName;
  const adminCanReveal =
    isAdmin &&
    !!order.manufacturer_alias &&
    order.manufacturer_alias !== order.manufacturer_name;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          testID="back-button"
          onPress={safeBack}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.refText}>{order.order_ref}</Text>
        </View>
        <View style={styles.headerRight}>
          <LanguageSwitcher compact />
          <StatusPill
            status={order.status === "completed" ? "completed" : "in progress"}
          />
          {user?.role === "admin" && (
          <TouchableOpacity
            testID="soft-delete-button"
            onPress={() => {
              const confirm = (proceed: () => void) => {
                if (Platform.OS === "web") {
                  // Native Alert dismisses too quickly on web; use confirm().
                  if (
                    typeof window !== "undefined" &&
                    window.confirm(
                      `Move ${order.order_ref} to the Recycle Bin? You can restore it from Atelier · Recycle Bin.`
                    )
                  ) {
                    proceed();
                  }
                  return;
                }
                Alert.alert(
                  "Move to Recycle Bin?",
                  `${order.order_ref} will leave the active list. Restore from Atelier · Recycle Bin.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Move to bin", style: "destructive", onPress: proceed },
                  ]
                );
              };
              confirm(async () => {
                try {
                  await api.softDeleteOrder(order.id);
                  router.replace("/(app)");
                } catch (e) {
                  Alert.alert(
                    "Delete failed",
                    e instanceof Error ? e.message : "Could not delete commission"
                  );
                }
              });
            }}
            style={[styles.iconBtn, { marginLeft: spacing.sm }]}
          >
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
          </TouchableOpacity>
        )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing.xxl,
        }}
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
        <Text style={styles.title}>{order.jewelry_name}</Text>
        <Text style={styles.subtitle}>
          Client · {order.client_name}   |   Workshop · {workshopDisplay}
        </Text>
        {adminCanReveal && (
          <TouchableOpacity
            testID="reveal-workshop-toggle"
            onPress={() => setRevealWorkshop((v) => !v)}
            style={styles.revealBtn}
          >
            <Ionicons
              name={revealWorkshop ? "eye-off-outline" : "eye-outline"}
              size={12}
              color={theme.primary}
            />
            <Text style={styles.revealText}>
              {revealWorkshop ? "HIDE WORKSHOP" : "REVEAL WORKSHOP"}
            </Text>
          </TouchableOpacity>
        )}
        {!!order.sku && <Text style={styles.sku}>SKU · {order.sku}</Text>}
        {!!order.description && (
          <Text style={styles.descText}>{order.description}</Text>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <View style={styles.progressRow}>
            <ProgressBar current={completed} total={total} />
            <Text style={styles.progressLabel}>
              {completed} / {total}
            </Text>
          </View>
        </View>

        {user?.role === "admin" && (
          <TouchableOpacity
            testID="customs-button"
            style={styles.customsBtn}
            onPress={() => router.push(`/(app)/customs/${order.id}`)}
          >
            <Ionicons name="document-lock-outline" size={18} color={theme.primary} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.customsTitle}>CUSTOMS · AIRWAY BILL</Text>
              <Text style={styles.customsSub}>
                Confidential — atelier only
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          testID="digital-dna-button"
          style={[styles.dnaBtn, !dnaUnlocked && styles.dnaBtnLocked]}
          onPress={() => {
            if (!dnaUnlocked) {
              Alert.alert(
                "Digital DNA locked",
                `Available once all 26 steps are finalised. ${completed} of ${total} complete.`
              );
              return;
            }
            setDnaModal(true);
          }}
        >
          <Ionicons
            name={dnaUnlocked ? "document-text-outline" : "lock-closed-outline"}
            size={18}
            color={dnaUnlocked ? "#0A0A0A" : theme.textMuted}
          />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[styles.dnaTitle, !dnaUnlocked && styles.dnaTitleLocked]}>
              {dnaUnlocked ? "VIEW DIGITAL DNA" : "DIGITAL DNA · LOCKED"}
            </Text>
            <Text style={[styles.dnaSub, !dnaUnlocked && styles.dnaSubLocked]}>
              {dnaUnlocked
                ? "Provenance certificate · PDF"
                : `Unlocks once all 26 steps are finalised · ${completed}/${total}`}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={dnaUnlocked ? "#0A0A0A" : theme.textMuted}
          />
        </TouchableOpacity>

        <Eyebrow>26-STEP JOURNEY</Eyebrow>

        {phases.map((p) => (
          <PhaseSection
            key={p}
            phase={p}
            phaseTitle={phaseTitleOf(p)}
            steps={order.steps.filter((s) => s.phase === p)}
            isOpen={expanded[p] ?? false}
            onToggle={() =>
              setExpanded((e) => ({ ...e, [p]: !(e[p] ?? false) }))
            }
            canEditStep={canEditStep}
            canForward={canForward}
            onPressStep={(stepNumber) => {
              if (canEditStep || canForward) {
                router.push(`/(app)/step/${order.id}/${stepNumber}`);
              }
            }}
          />
        ))}
      </ScrollView>

      <DigitalDnaModal
        visible={dnaModal}
        orderId={order.id}
        orderRef={order.order_ref}
        onClose={() => setDnaModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.bg,
  },
  iconBtn: { padding: 4, marginRight: spacing.sm },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  refText: { color: theme.primary, fontSize: 12, letterSpacing: 2 },
  title: {
    color: theme.textPrimary,
    fontSize: 24,
    fontWeight: "300",
    marginTop: spacing.sm,
    lineHeight: 30,
  },
  subtitle: { color: theme.textSecondary, fontSize: 12, marginTop: 6 },
  revealBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  revealText: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  sku: { color: theme.textMuted, fontSize: 11, marginTop: 4, letterSpacing: 1 },
  descText: {
    color: theme.textSecondary,
    fontSize: 13,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  progressLabel: { color: theme.textSecondary, fontSize: 12 },
  customsBtn: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: theme.primary,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  customsTitle: { color: theme.primary, fontSize: 11, letterSpacing: 2 },
  customsSub: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  dnaBtn: {
    marginBottom: spacing.lg,
    backgroundColor: theme.primary,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  dnaBtnLocked: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  dnaTitle: { color: "#0A0A0A", fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  dnaTitleLocked: { color: theme.textMuted },
  dnaSub: { color: "#0A0A0A", fontSize: 11, marginTop: 2, opacity: 0.7 },
  dnaSubLocked: { color: theme.textMuted, opacity: 1 },
});
