import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

type Row = {
  id: string;
  at: string;
  actor_email: string;
  action: string;
  ip: string | null;
  user_agent: string | null;
  meta: Record<string, any>;
};

const PAGE_SIZE = 50;

// Compact "x minutes ago" formatter that doesn't pull in moment/date-fns.
function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function ActionPill({ action }: { action: string }) {
  // Color buckets keep auth/critical events visually scannable.
  let bg = "rgba(218, 165, 32, 0.12)";
  let fg = theme.primary;
  if (action.startsWith("auth.login.failed")) {
    bg = "rgba(200, 85, 61, 0.15)";
    fg = "#C8553D";
  } else if (action.startsWith("auth.login") || action.startsWith("auth.")) {
    bg = "rgba(72, 144, 92, 0.15)";
    fg = "#48905C";
  } else if (action.startsWith("user.deleted") || action.endsWith(".deleted") || action.endsWith(".purge")) {
    bg = "rgba(200, 85, 61, 0.15)";
    fg = "#C8553D";
  } else if (action.startsWith("user.") || action.startsWith("order.") || action.startsWith("step.")) {
    bg = "rgba(110, 124, 196, 0.15)";
    fg = "#7C8FE0";
  } else if (action.startsWith("http.")) {
    bg = "rgba(170, 170, 170, 0.12)";
    fg = theme.textMuted;
  }
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {action}
      </Text>
    </View>
  );
}

export default function ActivityLogScreen() {
  const safeBack = useSafeBack("/(app)");
  const [rows, setRows] = useState<Row[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState("");
  const [actorInput, setActorInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(
    async (reset = false) => {
      if (loading) return;
      setLoading(true);
      try {
        const nextOffset = reset ? 0 : offset;
        const res = await api.activityLog({
          limit: PAGE_SIZE,
          offset: nextOffset,
          action: actionFilter || undefined,
          actor_email: actorFilter || undefined,
        });
        setTotal(res.total);
        setHasMore(nextOffset + res.rows.length < res.total);
        setOffset(nextOffset + res.rows.length);
        setRows((prev) => (reset ? res.rows : [...prev, ...res.rows]));
      } catch (e) {
        // Stay quiet — the list will just be empty.
        console.warn("activity log load failed", e);
      } finally {
        setLoading(false);
      }
    },
    [actionFilter, actorFilter, loading, offset],
  );

  // Initial + filter-change load (full reset).
  useEffect(() => {
    setOffset(0);
    setRows([]);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, actorFilter]);

  useFocusEffect(
    useCallback(() => {
      api.activityLogActions().then((r) => setActions(r.actions || [])).catch(() => {});
    }, []),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setOffset(0);
      setRows([]);
      await load(true);
      const r = await api.activityLogActions();
      setActions(r.actions || []);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const applyActor = () => setActorFilter(actorInput.trim());

  const actionChips = useMemo(() => {
    // Show All + up to the top 10 actions (alpha-sorted).
    return ["__all__", ...actions];
  }, [actions]);

  const renderRow = ({ item }: { item: Row }) => {
    const open = expandedId === item.id;
    const metaPretty = item.meta && Object.keys(item.meta).length
      ? JSON.stringify(item.meta, null, 2)
      : null;
    return (
      <TouchableOpacity
        testID={`activity-row-${item.id}`}
        activeOpacity={0.7}
        onPress={() => setExpandedId(open ? null : item.id)}
        style={styles.row}
      >
        <View style={styles.rowTop}>
          <ActionPill action={item.action} />
          <Text style={styles.rowAgo}>{relativeTime(item.at)}</Text>
        </View>
        <Text style={styles.rowActor} numberOfLines={1}>
          {item.actor_email}
        </Text>
        {item.ip ? <Text style={styles.rowIp}>{item.ip}</Text> : null}
        {open && (
          <View style={styles.detailsBox}>
            <Text style={styles.detailLabel}>WHEN</Text>
            <Text style={styles.detailValue}>{new Date(item.at).toLocaleString()}</Text>
            {item.user_agent ? (
              <>
                <Text style={styles.detailLabel}>USER AGENT</Text>
                <Text style={styles.detailValue} numberOfLines={3}>
                  {item.user_agent}
                </Text>
              </>
            ) : null}
            {metaPretty ? (
              <>
                <Text style={styles.detailLabel}>METADATA</Text>
                <Text style={[styles.detailValue, styles.mono]}>{metaPretty}</Text>
              </>
            ) : null}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity testID="activity-back" onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ACTIVITY LOG</Text>
        <TouchableOpacity onPress={() => setFiltersOpen((v) => !v)}>
          <Ionicons
            name={filtersOpen ? "options" : "options-outline"}
            size={22}
            color={theme.primary}
          />
        </TouchableOpacity>
      </View>

      {filtersOpen && (
        <View style={styles.filterBox}>
          <Text style={styles.filterLabel}>ACTION</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {actionChips.map((a) => {
              const isAll = a === "__all__";
              const sel = isAll ? !actionFilter : a === actionFilter;
              return (
                <TouchableOpacity
                  key={a}
                  testID={`filter-action-${a}`}
                  onPress={() => setActionFilter(isAll ? null : a)}
                  style={[styles.chip, sel && styles.chipSel]}
                >
                  <Text style={[styles.chipText, sel && styles.chipTextSel]}>
                    {isAll ? "All" : a}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={styles.filterLabel}>ACTOR EMAIL CONTAINS</Text>
          <View style={styles.actorRow}>
            <TextInput
              testID="filter-actor"
              value={actorInput}
              onChangeText={setActorInput}
              onSubmitEditing={applyActor}
              placeholder="e.g. somnio.co"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              style={styles.actorInput}
            />
            <TouchableOpacity onPress={applyActor} style={styles.applyBtn}>
              <Text style={styles.applyBtnText}>APPLY</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.subhead}>
        {total} event{total === 1 ? "" : "s"}
        {actionFilter ? ` · ${actionFilter}` : ""}
        {actorFilter ? ` · ${actorFilter}` : ""}
      </Text>

      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
        onEndReached={() => hasMore && !loading && load(false)}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loading ? (
            <View style={{ paddingVertical: spacing.lg }}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : !hasMore && rows.length > 0 ? (
            <Text style={styles.endText}>— END OF LOG —</Text>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.emptyText}>No activity recorded yet.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    color: theme.textPrimary,
    fontSize: 14,
    letterSpacing: 4,
    fontWeight: "600",
  },
  filterBox: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: spacing.sm,
  },
  filterLabel: {
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
  },
  chipSel: { borderColor: theme.primary, backgroundColor: "rgba(218,165,32,0.12)" },
  chipText: { color: theme.textSecondary, fontSize: 11 },
  chipTextSel: { color: theme.primary, fontWeight: "600" },
  actorRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  actorInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.textPrimary,
    fontSize: 13,
  },
  applyBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  applyBtnText: { color: "#0A0A0A", fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  subhead: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 1.5,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingVertical: spacing.md,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  rowAgo: { color: theme.textMuted, fontSize: 11 },
  rowActor: { color: theme.textPrimary, fontSize: 13, marginTop: 2 },
  rowIp: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, maxWidth: "70%" },
  pillText: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  detailsBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: theme.border,
    gap: 4,
  },
  detailLabel: { color: theme.textMuted, fontSize: 9, letterSpacing: 2, marginTop: 4 },
  detailValue: { color: theme.textSecondary, fontSize: 12 },
  mono: { fontFamily: "ui-monospace", fontSize: 11 },
  endText: {
    textAlign: "center",
    color: theme.textMuted,
    paddingVertical: spacing.lg,
    fontSize: 10,
    letterSpacing: 3,
  },
  emptyText: {
    textAlign: "center",
    color: theme.textMuted,
    paddingVertical: spacing.xxl,
  },
});
