/**
 * Admin · Cross-Order Renders Library
 * -----------------------------------
 * Mirrors `(app)/admin/cad-files.tsx` but sources from
 * `GET /api/admin/renders` (every APPROVED render across every commission)
 * and emails through `POST /api/admin/renders/email`.
 *
 * Differences from the CAD library:
 *   - Filter chips list CAD/Render *vendors* (`cad_renderer` role), not
 *     manufacturers.
 *   - Each row treats the entry as an image (vs CAD format badge) — when
 *     the URL points at Cloudinary we fall back to the file extension
 *     for the badge (JPG / PNG / WEBP / HEIC etc).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api, CadFile, User } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";
import { EmailFilesModal } from "@/src/components/EmailFilesModal";
import { notify } from "@/src/utils/confirm";
import { useI18n } from "@/src/i18n";

type LibraryRow = CadFile & {
  order_id: string;
  order_ref: string | null;
  jewelry_name: string | null;
  cad_renderer_id: string | null;
  cad_renderer_name: string | null;
  client_id: string | null;
  client_name: string | null;
};

type ListItem =
  | { kind: "header"; orderId: string; jewelryName: string; orderRef: string; count: number }
  | { kind: "file"; file: LibraryRow };

function extOf(f: CadFile): string {
  if (f.format) return f.format.toLowerCase();
  const i = f.name.lastIndexOf(".");
  return i >= 0 ? f.name.slice(i + 1).toLowerCase() : "?";
}

function formatBytes(b?: number | null): string {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function isImageUrl(u?: string | null): boolean {
  if (!u) return false;
  const lower = u.toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|heic|heif|avif)(\?|$)/.test(lower)
    || lower.includes("/image/upload/");
}

export default function RendersLibraryScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { t } = useI18n();

  const [studios, setStudios] = useState<User[]>([]);
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [studioFilter, setStudioFilter] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [emailOpen, setEmailOpen] = useState(false);

  const loadStudios = useCallback(async () => {
    try {
      const list = await api.listUsers("cad_renderer");
      setStudios(list);
    } catch (e) {
      console.warn("[renders-library] studios:", e);
    }
  }, []);

  const loadRows = useCallback(async () => {
    try {
      const list = await api.adminListAllRenders({
        cad_renderer_id: studioFilter,
        q: searchDebounced || null,
      });
      setRows(list as LibraryRow[]);
    } catch (e: any) {
      console.warn("[renders-library] rows:", e);
      notify("Couldn't load renders library", e?.message || String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studioFilter, searchDebounced]);

  useEffect(() => {
    loadStudios();
  }, [loadStudios]);

  useEffect(() => {
    setLoading(true);
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const toggleFile = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Group rows by parent commission, preserving the newest-first order.
  const items: ListItem[] = useMemo(() => {
    const out: ListItem[] = [];
    let lastOrder = "";
    let bucket: LibraryRow[] = [];
    const flush = (orderId: string) => {
      if (!bucket.length) return;
      const head = bucket[0];
      out.push({
        kind: "header",
        orderId,
        jewelryName: head.jewelry_name || "—",
        orderRef: head.order_ref || orderId.slice(0, 8),
        count: bucket.length,
      });
      bucket.forEach((f) => out.push({ kind: "file", file: f }));
      bucket = [];
    };
    rows.forEach((r) => {
      if (r.order_id !== lastOrder) {
        flush(lastOrder);
        lastOrder = r.order_id;
      }
      bucket.push(r);
    });
    flush(lastOrder);
    return out;
  }, [rows]);

  const fileLookup = useMemo(() => {
    const m = new Map<string, { order_id: string }>();
    rows.forEach((r) => m.set(r.id, { order_id: r.order_id }));
    return m;
  }, [rows]);

  const selectedFiles = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === "header") {
      return (
        <View style={styles.groupHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupTitle} numberOfLines={1}>
              {item.jewelryName}
            </Text>
            <Text style={styles.groupRef}>{item.orderRef}</Text>
          </View>
          <TouchableOpacity
            testID={`renders-library-open-order-${item.orderId}`}
            onPress={() => router.push(`/(app)/renders/${item.orderId}`)}
            style={styles.openOrderBtn}
          >
            <Text style={styles.openOrderBtnText}>{t("cad_lib.open")}</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.primary} />
          </TouchableOpacity>
        </View>
      );
    }

    const f = item.file;
    const ext = extOf(f);
    const isImg = isImageUrl(f.url);
    const checked = selectedIds.has(f.id);

    return (
      <TouchableOpacity
        testID={`renders-library-row-${f.id}`}
        onPress={() => toggleFile(f.id)}
        activeOpacity={0.8}
        style={[styles.fileRow, checked && styles.fileRowChecked]}
      >
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked && <Ionicons name="checkmark" size={14} color="#0A0A0A" />}
        </View>
        {isImg ? (
          <Image source={{ uri: f.url }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.badge, styles.badgeOther]}>
            <Text style={styles.badgeText}>{ext.toUpperCase().slice(0, 5)}</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.fileName} numberOfLines={1}>
            {f.name}
          </Text>
          <Text style={styles.fileMeta} numberOfLines={1}>
            {formatBytes(f.bytes)} · {formatWhen(f.uploaded_at)}
            {f.cad_renderer_name ? ` · ${f.cad_renderer_name}` : ""}
          </Text>
        </View>
        {!!f.url && (
          <TouchableOpacity
            testID={`renders-library-open-${f.id}`}
            onPress={() => Linking.openURL(f.url)}
            style={styles.previewBtn}
          >
            <Ionicons name="open-outline" size={16} color={theme.primary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const selectedCount = selectedIds.size;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity onPress={safeBack} testID="renders-library-back" style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{t("renders_lib.eyebrow")}</Text>
          <Text style={styles.title}>{t("renders_lib.title")}</Text>
        </View>
        {selectedCount > 0 && (
          <TouchableOpacity onPress={clearSelection} testID="renders-library-clear">
            <Text style={styles.clearText}>{t("cad_lib.clear_selection")}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <TouchableOpacity
            testID="renders-library-chip-all"
            onPress={() => setStudioFilter(null)}
            style={[styles.chip, studioFilter == null && styles.chipSel]}
          >
            <Text style={[styles.chipText, studioFilter == null && styles.chipTextSel]}>
              {t("renders_lib.all_studios")}
            </Text>
          </TouchableOpacity>
          {studios.map((s) => {
            const sel = studioFilter === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                testID={`renders-library-chip-${s.id}`}
                onPress={() => setStudioFilter(s.id)}
                style={[styles.chip, sel && styles.chipSel]}
              >
                <Text style={[styles.chipText, sel && styles.chipTextSel]}>
                  {(s.alias || s.name || "").toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={theme.textMuted} />
        <TextInput
          testID="renders-library-search"
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder={t("renders_lib.search_placeholder")}
          placeholderTextColor={theme.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchInput.length > 0 && (
          <TouchableOpacity onPress={() => setSearchInput("")} testID="renders-library-search-clear">
            <Ionicons name="close-circle" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={36} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>{t("renders_lib.empty")}</Text>
          <Text style={styles.emptyHint}>{t("renders_lib.empty_hint")}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, idx) =>
            it.kind === "header" ? `h-${it.orderId}` : `f-${it.file.id}-${idx}`
          }
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadRows();
              }}
              tintColor={theme.primary}
            />
          }
        />
      )}

      {selectedCount > 0 && (
        <View style={styles.ctaBar}>
          <Text style={styles.ctaCount}>
            {t("cad_lib.selected", { n: selectedCount })}
          </Text>
          <TouchableOpacity
            testID="renders-library-email-cta"
            style={styles.ctaBtn}
            onPress={() => setEmailOpen(true)}
          >
            <Ionicons name="mail-outline" size={16} color="#0A0A0A" />
            <Text style={styles.ctaBtnText}>
              {t(
                selectedCount === 1
                  ? "renders_lib.email_cta"
                  : "renders_lib.email_cta_plural",
                { n: selectedCount },
              )}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <EmailFilesModal
        visible={emailOpen}
        kind="cad"
        files={selectedFiles.map((f) => ({ id: f.id, name: f.name, bytes: f.bytes }))}
        jewelryName={null}
        onClose={() => setEmailOpen(false)}
        onSent={() => {
          setEmailOpen(false);
          clearSelection();
        }}
        send={async ({ recipients, file_ids, subject, message }) => {
          const items = file_ids
            .map((fid) => {
              const m = fileLookup.get(fid);
              return m ? { order_id: m.order_id, file_id: fid } : null;
            })
            .filter((x): x is { order_id: string; file_id: string } => x !== null);
          const res = await api.adminEmailCrossOrderRenders({
            recipients,
            items,
            subject,
            message,
          });
          return {
            ok: res.ok,
            recipients: res.recipients,
            file_count: res.file_count,
            provider_id: res.provider_id,
          };
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: spacing.sm,
  },
  eyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  title: { color: theme.textPrimary, fontSize: 18, marginTop: 2 },
  clearText: {
    color: theme.primary,
    fontSize: 10,
    letterSpacing: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  chipsWrap: { height: 52, borderBottomWidth: 1, borderBottomColor: theme.borderSubtle },
  chipsRow: { paddingHorizontal: spacing.lg, alignItems: "center", gap: spacing.sm },
  chip: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipSel: { borderColor: theme.primary },
  chipText: { color: theme.textSecondary, fontSize: 10, letterSpacing: 2 },
  chipTextSel: { color: theme.primary },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  searchInput: { flex: 1, color: theme.textPrimary, fontSize: 14, paddingVertical: 0 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    color: theme.textPrimary,
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  emptyHint: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  groupTitle: { color: theme.textPrimary, fontSize: 13, letterSpacing: 1 },
  groupRef: { color: theme.textMuted, fontSize: 10, letterSpacing: 2, marginTop: 2 },
  openOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  openOrderBtnText: { color: theme.primary, fontSize: 9, letterSpacing: 2 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  fileRowChecked: { borderColor: theme.primary },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: theme.primary, borderColor: theme.primary },
  thumb: {
    width: 48,
    height: 48,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    minWidth: 44,
    alignItems: "center",
  },
  badgeOther: { borderColor: theme.border, backgroundColor: "transparent" },
  badgeText: {
    color: theme.textPrimary,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "700",
  },
  fileName: { color: theme.textPrimary, fontSize: 13 },
  fileMeta: { color: theme.textMuted, fontSize: 10, marginTop: 2 },
  previewBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.primary,
    backgroundColor: theme.bg,
    gap: spacing.md,
  },
  ctaCount: { color: theme.textPrimary, fontSize: 12, letterSpacing: 1 },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  ctaBtnText: {
    color: "#0A0A0A",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
});
