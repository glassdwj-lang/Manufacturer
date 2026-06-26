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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, RecycledOrder } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { formatChinaTime } from "@/src/utils/format";
import { confirmAction } from "@/src/utils/confirm";
import { BrandStrip } from "@/src/components/BrandStrip";

export default function RecycleBinScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user } = useAuth();
  const [items, setItems] = useState<RecycledOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Admin-only screen. Bounce anyone else.
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/(app)");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    try {
      const rows = await api.listRecycleBin();
      setItems(rows);
    } catch (e) {
      console.warn("recycle-bin load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const restoreOne = (o: RecycledOrder) => {
    confirmAction({
      title: `Restore ${o.order_ref}?`,
      message: "It will return to the active commissions list.",
      confirmLabel: "Restore",
      onConfirm: async () => {
        setBusyId(o.id);
        try {
          await api.restoreOrder(o.id);
          await load();
        } catch (e) {
          Alert.alert("Restore failed", e instanceof Error ? e.message : String(e));
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  const purgeOne = (o: RecycledOrder) => {
    confirmAction({
      title: `Permanently delete ${o.order_ref}?`,
      message:
        "This will hard-delete the commission from the database. There is no undo.",
      confirmLabel: "Purge forever",
      destructive: true,
      onConfirm: async () => {
        setBusyId(o.id);
        try {
          await api.purgeOrder(o.id);
          await load();
        } catch (e) {
          Alert.alert("Purge failed", e instanceof Error ? e.message : String(e));
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <BrandStrip />
      <View style={styles.headerBar}>
        <TouchableOpacity testID="back-button" onPress={safeBack} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ATELIER · RECYCLE BIN</Text>
          <Text style={styles.title}>Deleted commissions</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
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
        <Text style={styles.lede}>
          Soft-deleted commissions live here indefinitely. Restore them to bring
          them back into the active list, or purge to remove them permanently.
        </Text>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="trash-bin-outline" size={28} color={theme.textMuted} />
            <Text style={styles.emptyText}>The Recycle Bin is empty.</Text>
          </View>
        ) : (
          items.map((o) => (
            <View key={o.id} style={styles.card} testID={`recycled-${o.order_ref}`}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardRef}>{o.order_ref}</Text>
                  <Text style={styles.cardName}>{o.jewelry_name}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardMetaSmall}>
                    {o.progress?.completed_count ?? 0}/{o.progress?.total ?? 26}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardClient}>Client · {o.client_name}</Text>
              <Text style={styles.cardDeleted}>
                Deleted {formatChinaTime(o.deleted_at)} CST by {o.deleted_by}
              </Text>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  testID={`restore-${o.order_ref}`}
                  style={styles.btnGhost}
                  onPress={() => restoreOne(o)}
                  disabled={busyId === o.id}
                >
                  {busyId === o.id ? (
                    <ActivityIndicator color={theme.primary} />
                  ) : (
                    <>
                      <Ionicons name="arrow-undo-outline" size={14} color={theme.primary} />
                      <Text style={styles.btnGhostText}>RESTORE</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`purge-${o.order_ref}`}
                  style={styles.btnDanger}
                  onPress={() => purgeOne(o)}
                  disabled={busyId === o.id}
                >
                  <Ionicons name="trash-outline" size={14} color={theme.danger} />
                  <Text style={styles.btnDangerText}>PURGE</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
  },
  iconBtn: { padding: 4, marginRight: spacing.sm },
  eyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  title: { color: theme.textPrimary, fontSize: 18, marginTop: 2 },
  lede: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: { color: theme.textMuted, fontSize: 13 },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start" },
  cardRef: { color: theme.primary, fontSize: 11, letterSpacing: 2 },
  cardName: {
    color: theme.textPrimary,
    fontSize: 15,
    marginTop: 4,
    fontWeight: "300",
  },
  cardMeta: { alignItems: "flex-end" },
  cardMetaSmall: { color: theme.textMuted, fontSize: 11 },
  cardClient: { color: theme.textSecondary, fontSize: 12, marginTop: 6 },
  cardDeleted: { color: theme.textMuted, fontSize: 11, marginTop: 4 },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btnGhost: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.primary,
    minHeight: 36,
  },
  btnGhostText: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  btnDanger: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.danger,
    minHeight: 36,
  },
  btnDangerText: { color: theme.danger, fontSize: 10, letterSpacing: 2 },
});
