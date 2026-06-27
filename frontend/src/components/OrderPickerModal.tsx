/**
 * OrderPickerModal — light bottom-sheet for picking one of the active
 * commissions when an action needs an order ID but the caller isn't in
 * a per-order context (e.g. uploading from a cross-order library).
 *
 * Fetches `api.listOrders()` on open, supports a debounced search box
 * that matches against jewelry name + order ref + client/manufacturer
 * alias, and returns the picked order to the caller.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";

export type PickableOrder = {
  id: string;
  order_ref: string;
  jewelry_name: string;
  manufacturer_alias?: string;
  client_alias?: string;
};

export function OrderPickerModal({
  visible,
  title = "Pick a commission",
  subtitle,
  onClose,
  onPick,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onPick: (order: PickableOrder) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PickableOrder[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const list = await api.listOrders();
        if (cancelled) return;
        setOrders(
          (list as any[]).map((o) => ({
            id: o.id,
            order_ref: o.order_ref || o.id.slice(0, 8),
            jewelry_name: o.jewelry_name || "—",
            manufacturer_alias: o.manufacturer_alias,
            client_alias: o.client_alias,
          })),
        );
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Could not load commissions.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      return (
        o.order_ref.toLowerCase().includes(q) ||
        o.jewelry_name.toLowerCase().includes(q) ||
        (o.manufacturer_alias || "").toLowerCase().includes(q) ||
        (o.client_alias || "").toLowerCase().includes(q)
      );
    });
  }, [orders, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          testID="order-picker-backdrop"
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? (
                <Text style={styles.subtitle}>{subtitle}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              testID="order-picker-close"
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={theme.textMuted} />
            <TextInput
              testID="order-picker-search"
              placeholder="Search by name, ref, workshop…"
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")}>
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.empty}>
                {query
                  ? "No commissions match your search."
                  : "No commissions yet."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`order-pick-${item.id}`}
                  style={styles.row}
                  onPress={() => onPick(item)}
                >
                  <Ionicons
                    name="diamond-outline"
                    size={18}
                    color={theme.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.jewelry_name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.order_ref}
                      {item.manufacturer_alias
                        ? `  ·  ${item.manufacturer_alias}`
                        : ""}
                      {item.client_alias ? `  ·  ${item.client_alias}` : ""}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.textMuted}
                  />
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: spacing.lg }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.bg,
    maxHeight: "80%",
    borderTopWidth: 1,
    borderColor: theme.divider,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: theme.divider,
    gap: spacing.sm,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderColor: theme.divider,
  },
  searchInput: {
    flex: 1,
    color: theme.textPrimary,
    fontSize: 13,
    paddingVertical: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: theme.divider,
  },
  rowName: { color: theme.textPrimary, fontSize: 13, fontWeight: "600" },
  rowMeta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  center: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { color: theme.textMuted, fontSize: 13 },
  error: { color: theme.error, fontSize: 13 },
});

export default OrderPickerModal;
