/**
 * HomeScreen — orchestrator for the commission home page.
 *
 * Renders the role-aware header, stats row, optional admin link rail,
 * the eyebrow + commission filter strip & panel, the Atelier Pulse
 * chart, and the FlatList of commission cards. Wires together two
 * dedicated hooks (`useCommissionFilters`, `useOrdersList`) plus the
 * dropdown options fetcher (`useUserOptions`).
 *
 * The previous monolithic ~1283-line `app/(app)/index.tsx` has been
 * decomposed into this file plus components/ + hooks/ under
 * `src/screens/home/`.
 */
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { Eyebrow } from "@/src/components/Ui";
import { HomeDailyChart } from "@/src/components/HomeDailyChart";
import { useI18n } from "@/src/i18n";

import { homeStyles } from "./styles";
import { useCommissionFilters } from "./hooks/useCommissionFilters";
import { useUserOptions } from "./hooks/useUserOptions";
import { useOrdersList } from "./hooks/useOrdersList";
import { HomeHeader } from "./components/HomeHeader";
import { Stat } from "./components/Stat";
import { AdminLinks, AssociateLinks } from "./components/AdminLinks";
import { CommissionFilterBar } from "./components/CommissionFilterBar";
import { CommissionFilterPanel } from "./components/CommissionFilterPanel";
import { BulkSelectToggleRow } from "./components/BulkSelectToggleRow";
import { BulkActionBar } from "./components/BulkActionBar";
import { OrderCard } from "./components/OrderCard";
import { HomeEmpty } from "./components/HomeEmpty";

export default function HomeScreen() {
  const { user, signOut, languageVersion } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const showFilters = user?.role === "admin" || user?.role === "associate";

  const filters = useCommissionFilters(!!showFilters);
  const { clientOptions, mfgOptions, assocOptions } = useUserOptions(
    !!showFilters,
  );
  const list = useOrdersList({
    role: user?.role,
    languageVersion,
    applied: filters.applied,
  });

  const [openPicker, setOpenPicker] = React.useState<
    "" | "client" | "mfg" | "assoc"
  >("");

  if (!user) return null;

  if (list.loading) {
    return (
      <SafeAreaView style={homeStyles.safe}>
        <View style={homeStyles.centerFull}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const activeOrders = list.orders.filter((o) => o.status === "in_progress");
  const completedOrders = list.orders.filter((o) => o.status === "completed");
  const canCreateCommission =
    user.role === "admin" || user.role === "associate";

  const renderHeader = () => (
    <View style={homeStyles.header}>
      <HomeHeader role={user.role} name={user.name} onLogout={signOut} />

      {user.role === "associate" && (
        <AssociateLinks approvalsCount={list.approvalsCount} />
      )}

      {user.role === "manufacturer" && (
        <View style={homeStyles.adminLinks}>
          <TouchableOpacity
            testID="mfg-rfqs-button"
            style={homeStyles.linkBtn}
            onPress={() => router.push("/(app)/manufacturer/rfqs")}
          >
            <Ionicons name="mail-open-outline" size={16} color={theme.primary} />
            <Text style={homeStyles.linkBtnText}>My RFQs</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={homeStyles.statsRow}>
        <Stat
          label={t("home.stat.active")}
          value={String(activeOrders.length)}
        />
        <Stat
          label={t("home.stat.completed")}
          value={String(completedOrders.length)}
        />
        <Stat label={t("home.stat.total")} value={String(list.orders.length)} />
      </View>

      {canCreateCommission && (
        <TouchableOpacity
          testID="create-order-button"
          style={homeStyles.cta}
          onPress={() => router.push("/(app)/create-order")}
        >
          <Ionicons name="add" size={16} color="#0A0A0A" />
          <Text style={homeStyles.ctaText}>{t("home.cta.new_commission")}</Text>
        </TouchableOpacity>
      )}

      {user.role === "admin" && (
        <AdminLinks approvalsCount={list.approvalsCount} />
      )}

      <Eyebrow testID="orders-section-eyebrow">
        {t("home.section.commissions")}
      </Eyebrow>

      {showFilters && (
        <CommissionFilterBar
          applied={filters.applied}
          activeCount={filters.activeCount}
          filtersOpen={filters.filtersOpen}
          onToggleOpen={() => filters.setFiltersOpen((v) => !v)}
          onClearOne={filters.clearOne}
          onClearAll={filters.clearAll}
          clientOptions={clientOptions}
          mfgOptions={mfgOptions}
          assocOptions={assocOptions}
        />
      )}

      {/* Atelier Pulse — daily activity chart for staff. */}
      {showFilters && <HomeDailyChart />}

      {showFilters && filters.filtersOpen && (
        <CommissionFilterPanel
          role={user.role}
          draft={filters.draft}
          setDraft={filters.setDraft}
          onApply={filters.applyDraft}
          onCancel={filters.cancelDraft}
          draftHasChanges={filters.draftHasChanges}
          openPicker={openPicker}
          setOpenPicker={setOpenPicker}
          clientOptions={clientOptions}
          mfgOptions={mfgOptions}
          assocOptions={assocOptions}
        />
      )}

      {user.role === "admin" && list.orders.length > 0 && (
        <BulkSelectToggleRow
          selectMode={list.selectMode}
          selectedCount={list.selectedIds.size}
          onEnter={list.enterSelect}
          onExit={list.exitSelect}
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={homeStyles.safe} edges={["top", "bottom"]}>
      <FlatList
        data={list.orders}
        keyExtractor={(o) => o.id}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={list.onRefresh}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={<HomeEmpty role={user.role} />}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            selectMode={list.selectMode}
            selected={list.selectedIds.has(item.id)}
            onPress={() => {
              if (list.selectMode) {
                list.toggleSelect(item.id);
              } else {
                router.push(`/(app)/order/${item.id}`);
              }
            }}
          />
        )}
      />
      {list.selectMode && (
        <BulkActionBar
          busy={list.bulkBusy}
          selectedCount={list.selectedIds.size}
          onCancel={list.exitSelect}
          onDelete={list.bulkDelete}
        />
      )}
    </SafeAreaView>
  );
}
