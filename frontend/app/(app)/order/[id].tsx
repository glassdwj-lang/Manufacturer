import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Order, Step } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { Eyebrow, ProgressBar, StatusPill } from "@/src/components/Ui";
import { useSafeBack } from "@/src/hooks/use-safe-back";

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ I: true });
  const [revealWorkshop, setRevealWorkshop] = useState(false);

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
  const phaseTitleOf = (p: string) => order.steps.find((s) => s.phase === p)?.phase_title ?? "";

  const canEditStep = user?.role === "manufacturer" || user?.role === "admin";
  const canForward = user?.role === "associate" || user?.role === "admin";

  const completed = order.progress?.completed_count ?? 0;
  const total = order.progress?.total ?? 26;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Sticky header */}
      <View style={styles.headerBar}>
        <TouchableOpacity testID="back-button" onPress={safeBack} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.refText}>{order.order_ref}</Text>
        </View>
        <StatusPill status={order.status === "completed" ? "completed" : "in progress"} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />
        }
      >
        <Text style={styles.title}>{order.jewelry_name}</Text>
        {(() => {
          // Admin sees the alias by default with a Reveal toggle to expose the real workshop name.
          // For everyone else, manufacturer_name is already aliased server-side.
          const isAdmin = user?.role === "admin";
          const aliasOrName = isAdmin
            ? (order.manufacturer_alias || order.manufacturer_name)
            : order.manufacturer_name;
          const display = isAdmin && revealWorkshop ? order.manufacturer_name : aliasOrName;
          return (
            <>
              <Text style={styles.subtitle}>
                Client · {order.client_name}   |   Workshop · {display}
              </Text>
              {isAdmin && order.manufacturer_alias && order.manufacturer_alias !== order.manufacturer_name && (
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
            </>
          );
        })()}
        {!!order.sku && <Text style={styles.sku}>SKU · {order.sku}</Text>}
        {!!order.description && <Text style={styles.descText}>{order.description}</Text>}

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
              <Text style={styles.customsSub}>Confidential — atelier only</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          testID="digital-dna-button"
          style={styles.dnaBtn}
          onPress={async () => {
            try {
              const blob = await api.fetchDigitalDna(order.id);
              if (Platform.OS === "web") {
                const url = URL.createObjectURL(blob);
                // Anchor-click is the most reliable way to open/save a
                // blob without tripping pop-up blockers. We open in a
                // new tab so the user can view the PDF inline.
                const a = document.createElement("a");
                a.href = url;
                a.target = "_blank";
                a.rel = "noopener,noreferrer";
                // Setting download lets browsers that can't render inline
                // PDFs fall back to a save action.
                a.download = `Somnio-DigitalDNA-${order.order_ref}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              } else {
                // Native: best-effort open via OS handler.
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = reader.result as string;
                  import("expo-linking").then(({ openURL }) => openURL(dataUrl));
                };
                reader.readAsDataURL(blob);
              }
            } catch (e) {
              Alert.alert(
                "Digital DNA",
                e instanceof Error ? e.message : "Failed to load certificate"
              );
              console.warn("digital dna error", e);
            }
          }}
        >
          <Ionicons name="document-text-outline" size={18} color="#0A0A0A" />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.dnaTitle}>VIEW DIGITAL DNA</Text>
            <Text style={styles.dnaSub}>Provenance certificate · PDF</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#0A0A0A" />
        </TouchableOpacity>

        <Eyebrow>26-STEP JOURNEY</Eyebrow>

        {phases.map((p) => {
          const isOpen = expanded[p] ?? false;
          const phaseSteps = order.steps.filter((s) => s.phase === p);
          const doneCount = phaseSteps.filter((s) => s.completed).length;
          return (
            <View key={p} style={styles.phaseBlock}>
              <TouchableOpacity
                testID={`phase-${p}-toggle`}
                onPress={() => setExpanded((e) => ({ ...e, [p]: !isOpen }))}
                style={styles.phaseHeader}
              >
                <View>
                  <Text style={styles.phaseEyebrow}>PHASE {p}</Text>
                  <Text style={styles.phaseTitle}>{phaseTitleOf(p)}</Text>
                </View>
                <View style={styles.phaseRight}>
                  <Text style={styles.phaseCount}>{doneCount}/{phaseSteps.length}</Text>
                  <Ionicons
                    name={isOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={theme.primary}
                  />
                </View>
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.stepsCol}>
                  {phaseSteps.map((s, idx) => (
                    <StepRow
                      key={s.step_number}
                      step={s}
                      isLast={idx === phaseSteps.length - 1}
                      canEdit={canEditStep}
                      canForward={canForward}
                      onPress={() => {
                        if (canEditStep || canForward) {
                          router.push(`/(app)/step/${order.id}/${s.step_number}`);
                        }
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function StepRow({
  step,
  isLast,
  canEdit,
  canForward,
  onPress,
}: {
  step: Step;
  isLast: boolean;
  canEdit: boolean;
  canForward: boolean;
  onPress: () => void;
}) {
  const dotColor = step.completed ? theme.primary : theme.border;
  const interactive = canEdit || canForward;
  return (
    <TouchableOpacity
      testID={`step-row-${step.step_number}`}
      style={styles.stepRow}
      onPress={onPress}
      disabled={!interactive}
      activeOpacity={interactive ? 0.7 : 1}
    >
      <View style={styles.stepRail}>
        <View style={[styles.stepDot, { backgroundColor: dotColor }]} />
        {!isLast && <View style={[styles.stepLine, { backgroundColor: theme.border }]} />}
      </View>
      <View style={styles.stepBody}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepNum}>{String(step.step_number).padStart(2, "0")}</Text>
          <Text style={styles.stepTitle}>{step.title}</Text>
          {step.completed && (
            <Ionicons name="checkmark-circle" size={16} color={theme.primary} style={{ marginLeft: 4 }} />
          )}
        </View>
        {step.description ? <Text style={styles.stepDesc}>{step.description}</Text> : null}
        {step.completed && step.completed_at_china && (
          <Text style={styles.stepMeta}>
            ✓ {formatChinaTime(step.completed_at_china)} CST
            {step.forwarded_to_client ? "  ·  Sent to client" : "  ·  Pending forward"}
          </Text>
        )}
        {!!step.photos?.length && (
          <Text style={styles.stepMeta}>📷 {step.photos.length} photo(s)</Text>
        )}
        {!!step.notes && <Text style={styles.stepNotes}>{step.notes}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function formatChinaTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
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
  refText: { color: theme.primary, fontSize: 12, letterSpacing: 2 },
  title: { color: theme.textPrimary, fontSize: 24, fontWeight: "300", marginTop: spacing.sm, lineHeight: 30 },
  subtitle: { color: theme.textSecondary, fontSize: 12, marginTop: 6 },
  revealBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: spacing.sm, alignSelf: "flex-start",
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: theme.borderSubtle,
  },
  revealText: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  sku: { color: theme.textMuted, fontSize: 11, marginTop: 4, letterSpacing: 1 },
  descText: { color: theme.textSecondary, fontSize: 13, marginTop: spacing.sm, lineHeight: 20 },
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
  dnaTitle: { color: "#0A0A0A", fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  dnaSub: { color: "#0A0A0A", fontSize: 11, marginTop: 2, opacity: 0.7 },
  phaseBlock: { borderWidth: 1, borderColor: theme.border, marginBottom: spacing.md },
  phaseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: theme.surface,
  },
  phaseEyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  phaseTitle: { color: theme.textPrimary, fontSize: 16, marginTop: 4 },
  phaseRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  phaseCount: { color: theme.textSecondary, fontSize: 12 },
  stepsCol: { padding: spacing.md, paddingTop: 0 },
  stepRow: { flexDirection: "row", paddingTop: spacing.md },
  stepRail: { width: 20, alignItems: "center" },
  stepDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  stepLine: { width: 1, flex: 1, marginTop: 4 },
  stepBody: { flex: 1, paddingBottom: spacing.md, paddingLeft: spacing.sm },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepNum: { color: theme.primary, fontSize: 11, letterSpacing: 1, width: 24 },
  stepTitle: { color: theme.textPrimary, fontSize: 14, flexShrink: 1 },
  stepDesc: { color: theme.textMuted, fontSize: 12, marginTop: 2, marginLeft: 32, lineHeight: 17 },
  stepMeta: { color: theme.textSecondary, fontSize: 11, marginTop: 4, marginLeft: 32 },
  stepNotes: { color: theme.textPrimary, fontSize: 12, marginTop: 4, marginLeft: 32, fontStyle: "italic" },
});
