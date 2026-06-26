import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { api, Order, User } from "@/src/api/client";
import { theme, spacing, ROLE_LABELS } from "@/src/theme";
import { Eyebrow, ProgressBar, PhaseBadge, CompletedBadge } from "@/src/components/Ui";
import { flags } from "@/src/flags";
import { confirmAction } from "@/src/utils/confirm";
import { LanguageSwitcher } from "@/src/components/LanguageSwitcher";
import { BrandStrip } from "@/src/components/BrandStrip";
import { DateField } from "@/src/components/DateField";
import { useI18n } from "@/src/i18n";

export default function HomeScreen() {
  const { user, signOut, languageVersion } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  // Filters live in the URL so a refresh (and shareable links) keep the same
  // view. We accept any of the supported keys on entry; everything else is
  // ignored.
  const urlParams = useLocalSearchParams<{
    client?: string;
    mfg?: string;
    assoc?: string;
    q?: string;
    from?: string;
    to?: string;
  }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Admin-only bulk-select state. When `selectMode` is on, each order card
  // becomes a tap-to-toggle checkbox row instead of opening the order detail.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [approvalsCount, setApprovalsCount] = useState(0);
  // ---- Commission filters --------------------------------------------------
  // Admin/associate can narrow the list by client/manufacturer/associate,
  // jewelry-type search, and a date window. Filter state lives in this
  // component (not URL) so a refresh resets cleanly.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // ---- Filter state model ------------------------------------------------
  // "Applied" filters are what's actually being sent to the API and shown in
  // the chip strip / URL. "Draft" filters mirror the form controls inside
  // the panel and only commit to applied when the admin taps GO. This
  // prevents the list from flickering on every dropdown tap.
  const initialApplied = {
    client: typeof urlParams.client === "string" ? urlParams.client : "",
    mfg: typeof urlParams.mfg === "string" ? urlParams.mfg : "",
    assoc: typeof urlParams.assoc === "string" ? urlParams.assoc : "",
    q: typeof urlParams.q === "string" ? urlParams.q : "",
    from: typeof urlParams.from === "string" ? urlParams.from : "",
    to: typeof urlParams.to === "string" ? urlParams.to : "",
  };
  const [appliedFilters, setAppliedFilters] = useState(initialApplied);
  const [filterClient, setFilterClient] = useState<string>(initialApplied.client);
  const [filterManufacturer, setFilterManufacturer] = useState<string>(initialApplied.mfg);
  const [filterAssociate, setFilterAssociate] = useState<string>(initialApplied.assoc);
  const [filterQuery, setFilterQuery] = useState(initialApplied.q);
  const [filterDateFrom, setFilterDateFrom] = useState(initialApplied.from);
  const [filterDateTo, setFilterDateTo] = useState(initialApplied.to);
  // Lookup tables for the dropdowns.
  const [clientOptions, setClientOptions] = useState<User[]>([]);
  const [mfgOptions, setMfgOptions] = useState<User[]>([]);
  const [assocOptions, setAssocOptions] = useState<User[]>([]);
  const [openPicker, setOpenPicker] = useState<"" | "client" | "mfg" | "assoc">("");

  const showFilters = user?.role === "admin" || user?.role === "associate";
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (appliedFilters.client) n += 1;
    if (appliedFilters.mfg) n += 1;
    if (appliedFilters.assoc) n += 1;
    if (appliedFilters.q) n += 1;
    if (appliedFilters.from) n += 1;
    if (appliedFilters.to) n += 1;
    return n;
  }, [appliedFilters]);

  /** Commit the draft form into ``appliedFilters`` (the source of truth that
   * drives the API + URL + chip strip). Triggered by the GO button or by
   * pressing return in the search field. */
  const applyDraft = useCallback(() => {
    setAppliedFilters({
      client: filterClient,
      mfg: filterManufacturer,
      assoc: filterAssociate,
      q: filterQuery.trim(),
      from: filterDateFrom,
      to: filterDateTo,
    });
    setFiltersOpen(false);
  }, [
    filterClient,
    filterManufacturer,
    filterAssociate,
    filterQuery,
    filterDateFrom,
    filterDateTo,
  ]);

  const draftHasChanges = useMemo(() => {
    return (
      filterClient !== appliedFilters.client ||
      filterManufacturer !== appliedFilters.mfg ||
      filterAssociate !== appliedFilters.assoc ||
      filterQuery.trim() !== appliedFilters.q ||
      filterDateFrom !== appliedFilters.from ||
      filterDateTo !== appliedFilters.to
    );
  }, [
    appliedFilters,
    filterClient,
    filterManufacturer,
    filterAssociate,
    filterQuery,
    filterDateFrom,
    filterDateTo,
  ]);

  const clearFilters = useCallback(() => {
    setFilterClient("");
    setFilterManufacturer("");
    setFilterAssociate("");
    setFilterQuery("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setAppliedFilters({ client: "", mfg: "", assoc: "", q: "", from: "", to: "" });
  }, []);

  const clearOne = useCallback((key: keyof typeof appliedFilters) => {
    if (key === "client") setFilterClient("");
    if (key === "mfg") setFilterManufacturer("");
    if (key === "assoc") setFilterAssociate("");
    if (key === "q") setFilterQuery("");
    if (key === "from") setFilterDateFrom("");
    if (key === "to") setFilterDateTo("");
    setAppliedFilters((p) => ({ ...p, [key]: "" }));
  }, []);

  // Mirror filter state into the URL so a refresh restores the same view
  // (and the URL becomes a shareable bookmark of the current report).
  useEffect(() => {
    if (!showFilters) return;
    const params: Record<string, string> = {};
    if (appliedFilters.client) params.client = appliedFilters.client;
    if (appliedFilters.mfg) params.mfg = appliedFilters.mfg;
    if (appliedFilters.assoc) params.assoc = appliedFilters.assoc;
    if (appliedFilters.q) params.q = appliedFilters.q;
    if (appliedFilters.from) params.from = appliedFilters.from;
    if (appliedFilters.to) params.to = appliedFilters.to;
    try {
      router.setParams(params as any);
    } catch {
      /* setParams isn't critical for functionality */
    }
  }, [showFilters, appliedFilters, router]);

  // Helpers to render human-readable chip labels.
  const userLabel = useCallback(
    (list: User[], id: string, fallback = "?") => {
      if (!id) return fallback;
      const hit = list.find((u) => u.id === id);
      if (!hit) return fallback;
      return hit.alias || hit.name || hit.email;
    },
    [],
  );
  const formatDateRangeChip = useCallback(
    (from: string, to: string): string => {
      const fmt = (iso: string): string => {
        if (!iso) return "";
        try {
          const [y, m, d] = iso.split("-").map(Number);
          const dt = new Date(y, (m || 1) - 1, d || 1);
          return dt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year:
              new Date().getFullYear() === y ? undefined : "numeric",
          });
        } catch {
          return iso;
        }
      };
      if (from && to) return `${fmt(from)} → ${fmt(to)}`;
      if (from) return `From ${fmt(from)}`;
      return `Until ${fmt(to)}`;
    },
    [],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await api.listOrders({
        client_id: appliedFilters.client || undefined,
        manufacturer_id: appliedFilters.mfg || undefined,
        associate_id: appliedFilters.assoc || undefined,
        q: appliedFilters.q || undefined,
        date_from: appliedFilters.from || undefined,
        date_to: appliedFilters.to || undefined,
      });
      setOrders(list);
      if (user && (user.role === "admin" || user.role === "associate")) {
        try {
          const q = await api.listPendingPhotos();
          setApprovalsCount(q.pending_count || 0);
        } catch {
          setApprovalsCount(0);
        }
      } else {
        setApprovalsCount(0);
      }
    } catch (e) {
      console.warn("load orders", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, appliedFilters]);

  const bulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    confirmAction({
      title: t("home.confirm.bulk_title", { n: ids.length, s: ids.length === 1 ? "" : "s" }),
      message: t("home.confirm.bulk_message"),
      confirmLabel: t("home.confirm.bulk_confirm", { n: ids.length }),
      destructive: true,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await api.bulkSoftDeleteOrders(ids);
          exitSelect();
          await load();
        } catch (e) {
          console.warn("bulk delete", e);
        } finally {
          setBulkBusy(false);
        }
      },
    });
  }, [selectedIds, exitSelect, load, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  // Load the people-picker options once on mount (admin gets all 3 lists,
  // associate only needs client + workshop lists).
  useEffect(() => {
    if (!showFilters) return;
    (async () => {
      try {
        const all = await api.listUsers();
        const clients = all.filter((u) => u.role === "client");
        const mfgs = all.filter((u) => u.role === "manufacturer");
        const assoc = all.filter((u) => u.role === "associate");
        setClientOptions(
          clients.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
        );
        setMfgOptions(
          mfgs.sort((a, b) => (a.alias || a.name || "").localeCompare(b.alias || b.name || "")),
        );
        setAssocOptions(
          assoc.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
        );
      } catch (e) {
        console.warn("filter lookup load", e);
      }
    })();
  }, [showFilters]);

  // Refresh the orders list when the manual language changes so cached
  // step titles re-localize without having to navigate away and back.
  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageVersion]);

  if (!user) return null;

  const ROLE_KEY: Record<string, "role.admin" | "role.manufacturer" | "role.associate" | "role.client"> = {
    admin: "role.admin",
    manufacturer: "role.manufacturer",
    associate: "role.associate",
    client: "role.client",
  };
  const roleLabel = ROLE_KEY[user.role] ? t(ROLE_KEY[user.role]) : (ROLE_LABELS[user.role] ?? user.role);

  const renderHeader = () => (
    <View style={styles.header}>
      <BrandStrip size={32} />
      <View style={styles.headerTop}>
        <View style={styles.brandText}>
          <Text style={styles.brandMark}>{t("home.brand_mark")}</Text>
          <Text style={styles.welcome}>{roleLabel} · {user.name}</Text>
        </View>
        <View style={styles.headerActions}>
          <LanguageSwitcher />
          <TouchableOpacity testID="logout-button" onPress={signOut} style={styles.iconBtn}>
            <Ionicons name="log-out-outline" size={22} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {user.role === "associate" && (
        <View style={styles.adminLinks}>
          <TouchableOpacity
            testID="approvals-button-assoc"
            style={styles.linkBtn}
            onPress={() => router.push("/(app)/approvals")}
          >
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.primary} />
            <Text style={styles.linkBtnText}>MEDIA APPROVALS</Text>
            {approvalsCount > 0 && (
              <View style={styles.approvalsBadge}>
                <Text style={styles.approvalsBadgeText}>{approvalsCount}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.statsRow}>
        <Stat label={t("home.stat.active")} value={String(orders.filter((o) => o.status === "in_progress").length)} />
        <Stat label={t("home.stat.completed")} value={String(orders.filter((o) => o.status === "completed").length)} />
        <Stat label={t("home.stat.total")} value={String(orders.length)} />
      </View>

      {(user.role === "admin" || user.role === "associate") && (
        <TouchableOpacity
          testID="create-order-button"
          style={styles.cta}
          onPress={() => router.push("/(app)/create-order")}
        >
          <Ionicons name="add" size={16} color="#0A0A0A" />
          <Text style={styles.ctaText}>{t("home.cta.new_commission")}</Text>
        </TouchableOpacity>
      )}

      {user.role === "admin" && (
        <View style={styles.adminLinks}>
          <TouchableOpacity
            testID="approvals-button"
            style={styles.linkBtn}
            onPress={() => router.push("/(app)/approvals")}
          >
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.primary} />
            <Text style={styles.linkBtnText}>MEDIA APPROVALS</Text>
            {approvalsCount > 0 && (
              <View style={styles.approvalsBadge}>
                <Text style={styles.approvalsBadgeText}>{approvalsCount}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="manage-users-button"
            style={[styles.linkBtn, { marginTop: spacing.sm }]}
            onPress={() => router.push("/(app)/users")}
          >
            <Ionicons name="people-outline" size={16} color={theme.primary} />
            <Text style={styles.linkBtnText}>{t("home.link.manage_users")}</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="dashboard-button"
            style={[styles.linkBtn, { marginTop: spacing.sm }]}
            onPress={() => router.push("/(app)/dashboard")}
          >
            <Ionicons name="stats-chart-outline" size={16} color={theme.primary} />
            <Text style={styles.linkBtnText}>Dashboard</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="recycle-bin-button"
            style={[styles.linkBtn, { marginTop: spacing.sm }]}
            onPress={() => router.push("/(app)/recycle-bin")}
          >
            <Ionicons name="trash-bin-outline" size={16} color={theme.primary} />
            <Text style={styles.linkBtnText}>{t("home.link.recycle_bin")}</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="activity-log-button"
            style={[styles.linkBtn, { marginTop: spacing.sm }]}
            onPress={() => router.push("/(app)/activity-log")}
          >
            <Ionicons name="document-text-outline" size={16} color={theme.primary} />
            <Text style={styles.linkBtnText}>Activity Log</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="test-translate-button"
            style={[styles.linkBtn, { marginTop: spacing.sm }]}
            onPress={() => router.push("/(app)/test-translate")}
          >
            <Ionicons name="language-outline" size={16} color={theme.primary} />
            <Text style={styles.linkBtnText}>{t("home.link.test_translation")}</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </TouchableOpacity>
          {flags.enableDebug && (
            <TouchableOpacity
              testID="debug-button"
              style={[styles.linkBtn, { marginTop: spacing.sm }]}
              onPress={() => router.push("/(app)/debug")}
            >
              <Ionicons name="construct-outline" size={16} color={theme.primary} />
              <Text style={styles.linkBtnText}>{t("home.link.debug")}</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <Eyebrow testID="orders-section-eyebrow">{t("home.section.commissions")}</Eyebrow>

      {showFilters && (
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterBarRow}
          >
            <TouchableOpacity
              testID="toggle-commission-filters"
              onPress={() => setFiltersOpen((v) => !v)}
              style={styles.filterToggle}
            >
              <Ionicons
                name={filtersOpen ? "funnel" : "funnel-outline"}
                size={14}
                color={activeFilterCount > 0 ? theme.primary : theme.textMuted}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  activeFilterCount > 0 && { color: theme.primary },
                ]}
              >
                FILTERS
              </Text>
              {activeFilterCount > 0 && (
                <View style={styles.filterCount}>
                  <Text style={styles.filterCountText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Active-filter chips — each tap on ✕ removes only that filter. */}
            {appliedFilters.q ? (
              <ActiveChip
                testID="active-chip-query"
                icon="search"
                label={`"${appliedFilters.q}"`}
                onClear={() => clearOne("q")}
              />
            ) : null}
            {(appliedFilters.from || appliedFilters.to) && (
              <ActiveChip
                testID="active-chip-date"
                icon="calendar-outline"
                label={formatDateRangeChip(appliedFilters.from, appliedFilters.to)}
                onClear={() => {
                  clearOne("from");
                  clearOne("to");
                }}
              />
            )}
            {appliedFilters.mfg ? (
              <ActiveChip
                testID="active-chip-mfg"
                icon="business-outline"
                label={userLabel(mfgOptions, appliedFilters.mfg, "Workshop")}
                onClear={() => clearOne("mfg")}
              />
            ) : null}
            {appliedFilters.assoc ? (
              <ActiveChip
                testID="active-chip-assoc"
                icon="person-circle-outline"
                label={userLabel(assocOptions, appliedFilters.assoc, "Associate")}
                onClear={() => clearOne("assoc")}
              />
            ) : null}
            {appliedFilters.client ? (
              <ActiveChip
                testID="active-chip-client"
                icon="person-outline"
                label={userLabel(clientOptions, appliedFilters.client, "Client")}
                onClear={() => clearOne("client")}
              />
            ) : null}

            {activeFilterCount > 0 && (
              <TouchableOpacity
                testID="clear-commission-filters"
                onPress={clearFilters}
                style={styles.filterClear}
              >
                <Text style={styles.filterClearText}>CLEAR ALL</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      {showFilters && filtersOpen && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>SEARCH JEWELRY TYPE / NAME</Text>
          <TextInput
            testID="filter-search-input"
            value={filterQuery}
            onChangeText={setFilterQuery}
            onSubmitEditing={applyDraft}
            returnKeyType="search"
            placeholder="e.g. ring, earring, necklace…"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            style={styles.searchInput}
          />

          <Text style={styles.filterLabel}>DATE RANGE</Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1, marginRight: 6 }}>
              <Text style={styles.filterSubLabel}>FROM</Text>
              <DateField
                testID="filter-date-from"
                value={filterDateFrom}
                onChange={setFilterDateFrom}
                placeholder="Any start date"
                maximumDate={filterDateTo ? new Date(filterDateTo) : undefined}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={styles.filterSubLabel}>TO</Text>
              <DateField
                testID="filter-date-to"
                value={filterDateTo}
                onChange={setFilterDateTo}
                placeholder="Any end date"
                minimumDate={filterDateFrom ? new Date(filterDateFrom) : undefined}
              />
            </View>
          </View>

          {user.role === "admin" && (
            <>
              <PeoplePicker
                label="WORKSHOP (MANUFACTURER)"
                placeholder="All workshops"
                options={mfgOptions}
                selectedId={filterManufacturer}
                isOpen={openPicker === "mfg"}
                onToggle={() => setOpenPicker(openPicker === "mfg" ? "" : "mfg")}
                onSelect={(id) => {
                  setFilterManufacturer(id);
                  setOpenPicker("");
                }}
                renderLabel={(u) => u.alias || u.name}
                renderSub={(u) => u.email}
              />
              <PeoplePicker
                label="ASSOCIATE"
                placeholder="All associates"
                options={assocOptions}
                selectedId={filterAssociate}
                isOpen={openPicker === "assoc"}
                onToggle={() => setOpenPicker(openPicker === "assoc" ? "" : "assoc")}
                onSelect={(id) => {
                  setFilterAssociate(id);
                  setOpenPicker("");
                }}
                renderLabel={(u) => u.name}
                renderSub={(u) => u.email}
              />
            </>
          )}
          <PeoplePicker
            label="CLIENT"
            placeholder="All clients"
            options={clientOptions}
            selectedId={filterClient}
            isOpen={openPicker === "client"}
            onToggle={() => setOpenPicker(openPicker === "client" ? "" : "client")}
            onSelect={(id) => {
              setFilterClient(id);
              setOpenPicker("");
            }}
            renderLabel={(u) => u.name}
            renderSub={(u) => u.email}
          />

          {/* GO + cancel row — filters only commit when GO is tapped. */}
          <View style={styles.goRow}>
            <TouchableOpacity
              testID="filter-cancel"
              onPress={() => {
                // Discard any draft changes and close.
                setFilterClient(appliedFilters.client);
                setFilterManufacturer(appliedFilters.mfg);
                setFilterAssociate(appliedFilters.assoc);
                setFilterQuery(appliedFilters.q);
                setFilterDateFrom(appliedFilters.from);
                setFilterDateTo(appliedFilters.to);
                setFiltersOpen(false);
              }}
              style={styles.goCancelBtn}
            >
              <Text style={styles.goCancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="filter-go"
              onPress={applyDraft}
              style={[styles.goBtn, !draftHasChanges && styles.goBtnDim]}
            >
              <Ionicons name="checkmark" size={14} color="#0A0A0A" />
              <Text style={styles.goBtnText}>GO</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {user.role === "admin" && orders.length > 0 && (
        <View style={styles.selectModeRow}>
          {selectMode ? (
            <Text style={styles.selectModeHint}>
              {t("home.bulk.selected", { n: selectedIds.size })}
            </Text>
          ) : (
            <Text style={styles.selectModeHint}>{t("home.bulk.hint")}</Text>
          )}
          <TouchableOpacity
            testID={selectMode ? "exit-select-mode" : "enter-select-mode"}
            onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
            style={styles.selectToggle}
          >
            <Ionicons
              name={selectMode ? "close-outline" : "checkbox-outline"}
              size={14}
              color={theme.primary}
            />
            <Text style={styles.selectToggleText}>
              {selectMode ? t("home.bulk.cancel_select") : t("home.bulk.select")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
            <Text style={styles.emptyTitle}>{t("home.empty.title")}</Text>
            <Text style={styles.emptyText}>
              {user.role === "admin" || user.role === "associate"
                ? t("home.empty.admin")
                : t("home.empty.viewer")}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            selectMode={selectMode}
            selected={selectedIds.has(item.id)}
            onPress={() => {
              if (selectMode) {
                toggleSelect(item.id);
              } else {
                router.push(`/(app)/order/${item.id}`);
              }
            }}
          />
        )}
      />
      {selectMode && (
        <View style={styles.bulkBar} testID="bulk-action-bar">
          <TouchableOpacity
            testID="bulk-cancel"
            onPress={exitSelect}
            style={styles.bulkCancel}
            disabled={bulkBusy}
          >
            <Text style={styles.bulkCancelText}>{t("common.cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="bulk-delete"
            onPress={bulkDelete}
            style={[
              styles.bulkDelete,
              (bulkBusy || selectedIds.size === 0) && { opacity: 0.4 },
            ]}
            disabled={bulkBusy || selectedIds.size === 0}
          >
            {bulkBusy ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={14} color="#0A0A0A" />
                <Text style={styles.bulkDeleteText}>
                  {t("home.bulk.move_to_bin", { n: selectedIds.size })}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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

function OrderCard({
  order,
  onPress,
  selectMode = false,
  selected = false,
}: {
  order: Order;
  onPress: () => void;
  selectMode?: boolean;
  selected?: boolean;
}) {
  const { t } = useI18n();
  const completed = order.progress?.completed_count ?? 0;
  const total = order.progress?.total ?? 26;
  const currentStep = order.steps?.find((s) => !s.completed);
  return (
    <TouchableOpacity
      testID={`order-card-${order.id}`}
      onPress={onPress}
      style={[
        styles.orderCard,
        selectMode && selected && styles.orderCardSelected,
      ]}
    >
      <View style={styles.orderCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderRef}>{order.order_ref}</Text>
          <Text style={styles.orderName}>{order.jewelry_name}</Text>
          <Text style={styles.orderSub}>
            {order.client_name} · {order.manufacturer_name}
          </Text>
        </View>
        <View style={styles.orderRightCol}>
          {currentStep ? (
            <PhaseBadge phase={currentStep.phase} />
          ) : (
            <CompletedBadge label={t("home.card.completed_badge")} />
          )}
          {selectMode && (
            <View
              style={styles.cardCheckbox}
              testID={`order-checkbox-${order.id}`}
            >
              <Ionicons
                name={selected ? "checkbox" : "square-outline"}
                size={22}
                color={selected ? theme.primary : theme.textMuted}
              />
            </View>
          )}
        </View>
      </View>
      <View style={styles.progressRow}>
        <ProgressBar current={completed} total={total} />
        <Text style={styles.progressText}>
          {completed} / {total}
        </Text>
      </View>
      {currentStep ? (
        <Text style={styles.currentStep}>
          {t("home.card.next_step", {
            n: currentStep.step_number,
            title: currentStep.title,
          })}
        </Text>
      ) : (
        <Text style={[styles.currentStep, { color: theme.success }]}>{t("home.card.all_done")}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  centerFull: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { marginBottom: spacing.lg },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  brandText: { flexShrink: 1 },
  brandMark: { color: theme.primary, fontSize: 10, letterSpacing: 3 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
  adminLinks: { marginBottom: spacing.lg, gap: 0 },
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
  approvalsBadge: {
    backgroundColor: theme.primary,
    borderRadius: 999,
    minWidth: 22,
    height: 18,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  approvalsBadgeText: { color: "#0A0A0A", fontSize: 10, fontWeight: "700" },
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
  // ---- Bulk-select ----
  selectModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  selectModeHint: { color: theme.textMuted, fontSize: 11 },
  selectToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  selectToggleText: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  orderCardSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.surfaceElevated,
  },
  cardCheckbox: {
    marginTop: 6,
    alignItems: "flex-end",
  },
  orderRightCol: {
    alignItems: "flex-end",
    gap: 6,
  },
  bulkBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bulkCancel: {
    flex: 1,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  bulkCancelText: { color: theme.textSecondary, fontSize: 11, letterSpacing: 2 },
  bulkDelete: {
    flex: 2,
    flexDirection: "row",
    gap: 6,
    paddingVertical: spacing.md,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  bulkDeleteText: { color: "#0A0A0A", fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  // ---- Commission filters --------------------------------------------------
  filterBar: {
    paddingTop: 4,
    paddingBottom: spacing.sm,
  },
  filterBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.primary,
    backgroundColor: "rgba(218,165,32,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    maxWidth: 220,
  },
  activeChipText: {
    color: theme.textPrimary,
    fontSize: 11,
    flexShrink: 1,
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  filterToggleText: {
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "600",
  },
  filterCount: {
    backgroundColor: theme.primary,
    paddingHorizontal: 6,
    minWidth: 18,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginLeft: 4,
  },
  filterCountText: { color: "#0A0A0A", fontSize: 10, fontWeight: "700" },
  filterClear: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterClearText: { color: theme.textMuted, fontSize: 10, letterSpacing: 2 },
  filterPanel: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.03)",
    gap: 4,
  },
  filterLabel: {
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: spacing.sm,
    marginBottom: 6,
  },
  filterSubLabel: {
    color: theme.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.textPrimary,
    fontSize: 13,
    minHeight: 40,
  },
  searchBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  dateRow: { flexDirection: "row", justifyContent: "space-between" },
  pickerToggle: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
  },
  pickerToggleText: { flex: 1, color: theme.textPrimary, fontSize: 13 },
  pickerToggleEmpty: { color: theme.textMuted },
  pickerList: {
    borderWidth: 1,
    borderColor: theme.border,
    borderTopWidth: 0,
    maxHeight: 200,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  pickerRowSel: { backgroundColor: "rgba(218,165,32,0.08)" },
  pickerRowName: { color: theme.textPrimary, fontSize: 13 },
  pickerRowSub: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  goRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  goCancelBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  goCancelText: {
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "600",
  },
  goBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.primary,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  goBtnDim: { opacity: 0.55 },
  goBtnText: { color: "#0A0A0A", fontSize: 12, fontWeight: "700", letterSpacing: 3 },
});

// Inline single-select people picker reused for client / manufacturer /
// associate filtering. Kept in this file (vs /src/components) because it's
// tightly coupled to the local picker-open state machine.
function PeoplePicker({
  label,
  placeholder,
  options,
  selectedId,
  isOpen,
  onToggle,
  onSelect,
  renderLabel,
  renderSub,
}: {
  label: string;
  placeholder: string;
  options: User[];
  selectedId: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  renderLabel: (u: User) => string;
  renderSub: (u: User) => string;
}) {
  const selected = options.find((u) => u.id === selectedId);
  return (
    <>
      <Text style={styles.filterLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.pickerToggle}
        onPress={onToggle}
        testID={`picker-toggle-${label.toLowerCase().replace(/[^a-z]/g, "-")}`}
      >
        <Text
          style={[
            styles.pickerToggleText,
            !selected && styles.pickerToggleEmpty,
          ]}
        >
          {selected ? renderLabel(selected) : placeholder}
        </Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={14}
          color={theme.textMuted}
        />
      </TouchableOpacity>
      {isOpen && (
        <ScrollView style={styles.pickerList} nestedScrollEnabled>
          <TouchableOpacity
            testID="picker-row-clear"
            style={styles.pickerRow}
            onPress={() => onSelect("")}
          >
            <Text
              style={[styles.pickerRowName, !selectedId && { color: theme.primary }]}
            >
              {placeholder}
            </Text>
            {!selectedId && (
              <Ionicons
                name="checkmark"
                size={16}
                color={theme.primary}
                style={{ marginLeft: "auto" }}
              />
            )}
          </TouchableOpacity>
          {options.map((u) => {
            const sel = selectedId === u.id;
            return (
              <TouchableOpacity
                key={u.id}
                testID={`picker-row-${u.id}`}
                style={[styles.pickerRow, sel && styles.pickerRowSel]}
                onPress={() => onSelect(u.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.pickerRowName, sel && { color: theme.primary }]}
                    numberOfLines={1}
                  >
                    {renderLabel(u)}
                  </Text>
                  <Text style={styles.pickerRowSub} numberOfLines={1}>
                    {renderSub(u)}
                  </Text>
                </View>
                {sel && <Ionicons name="checkmark" size={16} color={theme.primary} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

/**
 * Tiny pill rendered in the filter bar for each active filter. Shows an
 * icon + label and an inline ✕ that removes only that filter.
 */
function ActiveChip({
  testID,
  icon,
  label,
  onClear,
}: {
  testID?: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onClear: () => void;
}) {
  return (
    <View style={styles.activeChip} testID={testID}>
      <Ionicons name={icon} size={12} color={theme.primary} />
      <Text style={styles.activeChipText} numberOfLines={1}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={onClear}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        testID={testID ? `${testID}-clear` : undefined}
      >
        <Ionicons name="close" size={14} color={theme.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
