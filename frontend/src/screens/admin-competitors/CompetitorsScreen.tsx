/**
 * CompetitorsScreen — admin management of the Market-Anchor scraper library.
 *
 * Full CRUD: add new (custom) competitors, edit any field on library or
 * custom sites, delete a site (soft for hardcoded, hard for custom).
 * Toggling active/paused stays as a one-tap switch on the row.
 *
 * All persistence goes through `/api/admin/competitors` — the merged
 * (library ∪ DB overrides) list is what the anchor scraper actually
 * runs against.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

type Site = {
  id: string; name: string;
  base_url: string; search_url: string;
  active: boolean;
  strategy?: string; feasibility?: string;
  notes?: string;
  custom?: boolean;   // true for admin-added sites (hard-deletable)
};

/**
 * Shape of the modal form — all fields are strings for TextInput
 * compatibility, coerced on submit. ``strategy`` uses a small chip
 * selector rather than free text.
 */
type Draft = {
  id: string; name: string;
  base_url: string; search_url: string;
  strategy: string; notes: string;
};

const STRATEGIES = ["html_llm", "playwright_llm", "shopify_json"] as const;

export default function CompetitorsScreen() {
  const safeBack = useSafeBack("/(app)");
  const [items, setItems] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add/Edit modal state — ``editing`` null means "add", otherwise "edit".
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [draft, setDraft] = useState<Draft>({
    id: "", name: "", base_url: "", search_url: "",
    strategy: "html_llm", notes: "",
  });
  const [saving, setSaving] = useState(false);
  // Test-run state — kept per-modal so results reset on close/reopen.
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | {
    ok: boolean; site_name: string; url_tried: string;
    match_count: number; elapsed_ms: number;
    matches: Array<{ product_name?: string; price_native?: number; price_currency?: string; confidence?: number }>;
    error?: string | null;
  }>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.listCompetitorsAdmin());
    } catch (e: any) {
      Alert.alert("Load failed", e?.message || "unknown");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setDraft({ id: "", name: "", base_url: "", search_url: "",
               strategy: "html_llm", notes: "" });
    setTestResult(null);
    setModalOpen(true);
  };
  const openEdit = (s: Site) => {
    setEditing(s);
    setDraft({
      id: s.id,
      name: s.name || "",
      base_url: s.base_url || "",
      search_url: s.search_url || "",
      strategy: s.strategy || "html_llm",
      notes: s.notes || "",
    });
    setTestResult(null);
    setModalOpen(true);
  };

  /**
   * Persist any unsaved changes then return the effective site id.
   * Used by both the "Save" button and the "Run test" flow — the test
   * always runs against the *current* DB state so admins never test a
   * URL they didn't actually save.
   */
  const persistDraft = async (): Promise<string | null> => {
    const name = draft.name.trim();
    const search_url = draft.search_url.trim();
    if (!name || !search_url) {
      Alert.alert("Missing fields", "Name and Search URL are required.");
      return null;
    }
    if (editing) {
      const patch: any = {};
      if (name !== editing.name) patch.name = name;
      if (draft.base_url.trim() !== (editing.base_url || "")) patch.base_url = draft.base_url.trim();
      if (search_url !== editing.search_url) patch.search_url = search_url;
      if (draft.strategy !== (editing.strategy || "html_llm")) patch.strategy = draft.strategy;
      if (draft.notes.trim() !== (editing.notes || "")) patch.notes = draft.notes.trim();
      if (Object.keys(patch).length > 0) {
        const updated = await api.updateCompetitor(editing.id, patch);
        setItems(prev => prev.map(s => (s.id === editing.id ? updated : s)));
        // Keep local editing target in sync so subsequent tests use the new URL.
        setEditing(updated);
      }
      return editing.id;
    }
    // Add flow — POST and re-target the modal to Edit mode of the new row.
    const created = await api.createCompetitor({
      id: draft.id.trim() || undefined,
      name,
      base_url: draft.base_url.trim() || new URL(search_url).origin,
      search_url,
      strategy: draft.strategy,
      notes: draft.notes.trim() || undefined,
      active: true,
    });
    setItems(prev => [...prev, created]);
    setEditing(created);
    return created.id;
  };

  const submit = async () => {
    setSaving(true);
    try {
      const id = await persistDraft();
      if (id) setModalOpen(false);
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "unknown");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Save-then-scrape flow. Uses a canned RFQ (1ct Round natural D/VVS2)
   * server-side to sanity-check the URL + strategy without touching any
   * real quote. Result stays displayed inside the modal so admin can
   * iterate on the URL until it produces matches.
   */
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const id = await persistDraft();
      if (!id) return;
      const r = await api.testCompetitor(id);
      setTestResult(r);
    } catch (e: any) {
      setTestResult({
        ok: false, site_name: draft.name, url_tried: draft.search_url,
        match_count: 0, elapsed_ms: 0, matches: [],
        error: e?.message || "unknown",
      });
    } finally {
      setTesting(false);
    }
  };

  const toggleActive = async (site: Site, value: boolean) => {
    setItems(prev => prev.map(s => (s.id === site.id ? { ...s, active: value } : s)));
    try {
      await api.updateCompetitor(site.id, { active: value });
    } catch (e: any) {
      setItems(prev => prev.map(s => (s.id === site.id ? { ...s, active: !value } : s)));
      Alert.alert("Toggle failed", e?.message || "unknown");
    }
  };

  const deleteSite = (site: Site) => {
    const hard = site.custom === true;
    Alert.alert(
      hard ? "Delete competitor?" : "Remove from active library?",
      hard
        ? `Permanently delete "${site.name}"? This can't be undone.`
        : `Hide "${site.name}" from scrape runs. You can restore it later via Reset to defaults.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: hard ? "Delete" : "Remove", style: "destructive", onPress: async () => {
          try {
            const r = await api.deleteCompetitor(site.id);
            if (r.hard) {
              // Hard-delete — remove the row entirely.
              setItems(prev => prev.filter(s => s.id !== site.id));
            } else {
              // Soft-delete — filter locally; reset via Add flow if needed.
              setItems(prev => prev.filter(s => s.id !== site.id));
            }
          } catch (e: any) {
            Alert.alert("Delete failed", e?.message || "unknown");
          }
        }},
      ],
    );
  };

  const resetSite = (site: Site) => {
    Alert.alert(
      "Reset overrides?",
      `Discard your edits on "${site.name}" and restore hardcoded defaults?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: async () => {
          try {
            const restored = await api.resetCompetitor(site.id);
            setItems(prev => prev.map(s => (s.id === site.id ? restored : s)));
          } catch (e: any) {
            Alert.alert("Reset failed", e?.message || "unknown");
          }
        }},
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: theme.textPrimary }}>
          Competitor Library
        </Text>
        <TouchableOpacity onPress={openAdd}>
          <Ionicons name="add-circle" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>
      <Text style={{ color: theme.textMuted, fontSize: 11, paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
        Toggle sites active / paused, edit their URLs, add new competitors, or remove existing ones. Paused sites are skipped in every Run/Refresh anchors call.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: spacing.md, maxWidth: 720, width: "100%", alignSelf: "center", paddingBottom: 60 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />}
          renderItem={({ item }) => (
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ color: theme.textPrimary, fontWeight: "700", fontSize: 14 }}>{item.name}</Text>
                    {item.custom && (
                      <View style={{ marginLeft: 6, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: "#3A2E1A" }}>
                        <Text style={{ color: "#E0A85B", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 }}>CUSTOM</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                    {item.id} · {item.strategy}{item.feasibility ? ` · ${item.feasibility}` : ""}
                  </Text>
                </View>
                <Switch
                  value={!!item.active}
                  onValueChange={(v) => toggleActive(item, v)}
                  thumbColor={item.active ? theme.primary : "#666"}
                  trackColor={{ true: "#3A3A2A", false: "#333" }}
                />
              </View>

              <TouchableOpacity onPress={() => openEdit(item)} style={{ paddingVertical: 2 }}>
                <Text style={{ color: theme.primary, fontSize: 11 }} numberOfLines={1}>
                  {item.search_url}
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: "row", marginTop: 4, gap: 14 }}>
                <TouchableOpacity onPress={() => openEdit(item)} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="create-outline" size={12} color={theme.primary} style={{ marginRight: 3 }} />
                  <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "700" }}>Edit</Text>
                </TouchableOpacity>
                {!item.custom && (
                  <TouchableOpacity onPress={() => resetSite(item)}>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>Reset to defaults</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => deleteSite(item)} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="trash-outline" size={12} color="#E5484D" style={{ marginRight: 3 }} />
                  <Text style={{ color: "#E5484D", fontSize: 10, fontWeight: "700" }}>
                    {item.custom ? "Delete" : "Remove"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: theme.textMuted, marginTop: 20 }}>
              No competitors. Tap + to add one.
            </Text>
          }
        />
      )}

      {/* --- Add / Edit modal --- */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={{
          flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "center", alignItems: "center", padding: spacing.md,
        }}>
          <View style={{
            backgroundColor: theme.bg, borderRadius: 12, padding: spacing.md,
            borderWidth: 1, borderColor: theme.border,
            width: "100%", maxWidth: 480,
          }}>
            <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: spacing.sm }}>
              {editing ? `Edit ${editing.name}` : "Add competitor"}
            </Text>

            {/* Row: Name */}
            <FormField label="Name *" value={draft.name}
              onChangeText={(v) => setDraft(d => ({ ...d, name: v }))}
              placeholder="e.g. Tiffany & Co." />

            {/* Row: Base URL */}
            <FormField label="Base URL"
              value={draft.base_url}
              onChangeText={(v) => setDraft(d => ({ ...d, base_url: v }))}
              placeholder="https://www.example.com  (auto-derived from search URL if blank)" />

            {/* Row: Search URL */}
            <FormField label="Search URL *"
              value={draft.search_url}
              onChangeText={(v) => setDraft(d => ({ ...d, search_url: v }))}
              placeholder="https://www.example.com/engagement-rings" />

            {/* Row: Strategy chips */}
            <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 4, marginTop: 4 }}>Strategy</Text>
            <View style={{ flexDirection: "row", marginBottom: 8, flexWrap: "wrap" }}>
              {STRATEGIES.map(s => {
                const on = draft.strategy === s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setDraft(d => ({ ...d, strategy: s }))}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
                      borderWidth: 1, borderColor: on ? theme.primary : theme.border,
                      backgroundColor: on ? "#2A2A1A" : "transparent",
                      marginRight: 6, marginBottom: 4,
                    }}
                  >
                    <Text style={{ color: on ? theme.textPrimary : theme.textMuted, fontSize: 11, fontWeight: on ? "700" : "500" }}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 10, marginBottom: 8 }}>
              html_llm = simple GET + LLM extract. playwright_llm = headless browser render (for JS-heavy sites). shopify_json = /products.json shortcut.
            </Text>

            {/* Row: Notes */}
            <FormField label="Notes"
              value={draft.notes}
              onChangeText={(v) => setDraft(d => ({ ...d, notes: v }))}
              placeholder="Optional context (e.g. Cloudflare-blocked)"
              multiline />

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: 8, flexWrap: "wrap" }}>
              <TouchableOpacity onPress={() => setModalOpen(false)} disabled={saving || testing} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: theme.textMuted, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submit}
                disabled={saving || testing}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6,
                  backgroundColor: theme.primary, opacity: (saving || testing) ? 0.4 : 1,
                  flexDirection: "row", alignItems: "center",
                }}
              >
                {saving && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />}
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {saving ? "Saving…" : (editing ? "Save changes" : "Add competitor")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* --- Run test button + result panel ------------------------
                Sits below the Save row so the flow reads: fill form →
                Save → verify the URL works. Save is called first (so
                any edits land in DB) then a dry-run scrape uses a
                canned RFQ to check reachability + strategy fit. */}
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
              <TouchableOpacity
                onPress={runTest}
                disabled={saving || testing || !draft.name.trim() || !draft.search_url.trim()}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center",
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6,
                  borderWidth: 1, borderColor: theme.primary,
                  opacity: (saving || testing || !draft.name.trim() || !draft.search_url.trim()) ? 0.4 : 1,
                }}
              >
                {testing
                  ? <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 6 }} />
                  : <Ionicons name="flask-outline" size={14} color={theme.primary} style={{ marginRight: 6 }} />}
                <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 12 }}>
                  {testing ? "Testing scrape…" : "Run test scrape"}
                </Text>
              </TouchableOpacity>
              <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 4, textAlign: "center" }}>
                Saves first, then dry-scrapes with a canned RFQ (1ct Round natural D/VVS2). Doesn't touch any real quote.
              </Text>

              {testResult && (
                <View style={{
                  marginTop: 10, padding: 10, borderRadius: 6,
                  borderWidth: 1,
                  borderColor: testResult.ok ? "#164E3B" : "#5A2020",
                  backgroundColor: testResult.ok ? "#0F221A" : "#1F0F0F",
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                    <Ionicons
                      name={testResult.ok ? "checkmark-circle" : "close-circle"}
                      size={16}
                      color={testResult.ok ? "#2FB870" : "#E5484D"}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700", flex: 1 }}>
                      {testResult.ok ? "OK" : "Failed"} · {testResult.match_count} match{testResult.match_count === 1 ? "" : "es"} · {testResult.elapsed_ms}ms
                    </Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 10, marginBottom: 4 }} numberOfLines={2}>
                    {testResult.url_tried}
                  </Text>
                  {testResult.error && (
                    <Text style={{ color: "#E5484D", fontSize: 10, marginBottom: 4 }}>
                      {testResult.error}
                    </Text>
                  )}
                  {testResult.matches.slice(0, 3).map((m, i) => {
                    const cur = (m.price_currency || "AUD").toUpperCase();
                    const amt = m.price_native ?? (m as any).price_aud ?? 0;
                    return (
                      <View key={i} style={{ marginTop: 4 }}>
                        <Text style={{ color: theme.textPrimary, fontSize: 11 }} numberOfLines={1}>
                          • {(m.product_name || "unnamed")}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                          {cur} {typeof amt === "number" ? amt.toLocaleString() : amt} · conf {Math.round((m.confidence || 0) * 100)}%
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Small labelled TextInput used inside the Add/Edit modal so the form
 * markup stays readable and each field has consistent styling.
 */
function FormField({ label, value, onChangeText, placeholder, multiline }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 2 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        style={{
          borderWidth: 1, borderColor: theme.border, borderRadius: 6,
          paddingHorizontal: 8, paddingVertical: 6,
          color: theme.textPrimary, fontSize: 12,
          minHeight: multiline ? 44 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
