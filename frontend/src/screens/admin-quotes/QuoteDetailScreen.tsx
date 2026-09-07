/**
 * QuoteDetailScreen (polished) — grouped, spreadsheet-style admin
 * form. Layout mirrors the S.Co quote template's cascade:
 *
 *   1. Header pill  ─────────────────────────────  status + serial + RFQ link
 *   2. Product spec   (text inputs)               piece description, metal, stone
 *   3. USD costs      (numeric group)             ring, halo pavé (switch), cut,
 *                                                 CAD, provenance, cert, box, freight
 *   4. Currency       (numeric group)             USD→AUD rate
 *   5. AUD costs      (numeric group)             customs, delivery, intl fees, duty
 *   6. Margin & GST   (numeric group)             markup %, GST %
 *   7. Discount tiers (table)                     add / remove / edit % tiers
 *   8. Totals panel   (read-only)                 the full cascade + margin
 *
 * Live recompute: every input change debounces 400ms then hits
 * `POST /api/quotes/compute` for preview totals. Save-on-blur persists
 * via `PATCH /api/quotes/{id}`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Platform, ScrollView, Switch, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

// ---------- Field group definitions ----------
type NumF = { key: string; label: string; suffix?: string; hint?: string };

const USD_FIELDS: NumF[] = [
  { key: "ring_cost_usd", label: "Ring cost", suffix: "USD" },
  { key: "extra_cut_cost_usd", label: "Extra cut", suffix: "USD" },
  { key: "cad_rendering_cost_usd", label: "CAD rendering", suffix: "USD" },
  { key: "provenance_cost_usd", label: "Provenance", suffix: "USD" },
  { key: "certification_cost_usd", label: "Certification", suffix: "USD" },
  { key: "box_packaging_cost_usd", label: "Box & packaging", suffix: "USD" },
  { key: "air_freight_cost_usd", label: "Air freight", suffix: "USD" },
];

const AUD_FIELDS: NumF[] = [
  { key: "custom_clearance_aud", label: "Customs clearance", suffix: "AUD" },
  { key: "australian_delivery_aud", label: "AU delivery", suffix: "AUD" },
];

// The two flexible rows in the AUD Costs section: either fixed $ AUD or
// % of the converted AUD total (USD subtotal × effective FX rate).
const FLEX_FIELDS = [
  { root: "intl_transaction_fees", label: "Intl transaction fees" },
  { root: "duty_or_chafta",        label: "Duty / CHAFTA" },
] as const;

const STATUSES: { key: string; label: string; color: string }[] = [
  { key: "draft", label: "Draft", color: "#3A3A3A" },
  { key: "ready", label: "Ready", color: "#164E3B" },
  { key: "sent", label: "Sent", color: "#4A2E7A" },
];

/** Semantic tint palette for the atelier-baseline emphasis rows.
 * Green = pass-through fees (buffer + intl + duty).
 * Red   = the tax we always collect (GST 10%).
 * Yellow = the margin lever the admin manually tunes (Markup). */
const SEMANTIC = {
  green:  "#2FB870",
  red:    "#E5484D",
  yellow: "#E0A85B",
} as const;

// ---------- Small presentational helpers ----------
function Section({ title, subtitle, children, collapsible, defaultOpen }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** When true, renders a chevron and lets the user fold the body away. */
  collapsible?: boolean;
  /** Initial expanded state when ``collapsible`` — defaults to true. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen !== false);
  const Header = collapsible ? TouchableOpacity : View;
  return (
    <View style={{
      backgroundColor: "#111", borderRadius: 10, padding: spacing.md,
      marginTop: spacing.md, borderWidth: 1, borderColor: theme.border,
    }}>
      <Header
        activeOpacity={collapsible ? 0.7 : 1}
        onPress={collapsible ? () => setOpen(o => !o) : undefined}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase" }}>{title}</Text>
          {subtitle && <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>}
        </View>
        {collapsible && (
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.textMuted}
          />
        )}
      </Header>
      {(!collapsible || open) && (
        <View style={{ marginTop: spacing.sm }}>{children}</View>
      )}
    </View>
  );
}

function NumRow({ label, suffix, value, onChangeText, onBlur, disabled, labelColor }: {
  label: string; suffix?: string; value: string;
  onChangeText: (v: string) => void; onBlur?: () => void; disabled?: boolean;
  // Optional bold-coloured label for atelier-baseline emphasis rows.
  labelColor?: string;
}) {  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
      <Text style={{
        color: labelColor || theme.textPrimary,
        fontWeight: labelColor ? "700" : "400",
        flex: 1, fontSize: 13,
      }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", width: 140 }}>
        <TextInput
          editable={!disabled}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          keyboardType="decimal-pad"
          // NOTE: `flex: 1` alone is not enough on React-Native-Web because
          // the underlying <input> has a default intrinsic size (~20ch) that
          // overrides flex, causing the input to overflow its 140-wide row
          // and the value to render outside the border. `minWidth: 0` +
          // `width: 0` neutralises that intrinsic width so flex can size it.
          style={{
            flex: 1, minWidth: 0, width: 0,
            borderWidth: 1, borderColor: theme.border, borderRadius: 6,
            paddingHorizontal: 8, paddingVertical: 6, color: theme.textPrimary,
            textAlign: "right", opacity: disabled ? 0.4 : 1,
          }}
        />
        {suffix && <Text style={{ color: theme.textMuted, fontSize: 11, width: 32, textAlign: "right", marginLeft: 4 }}>{suffix}</Text>}
      </View>
    </View>
  );
}

function TotalRow({ label, val, unit, big }: { label: string; val: number | undefined | null; unit: string; big?: boolean }) {
  const fmt = val == null ? "—" :
    unit === "%" ? `${Number(val).toFixed(2)}%` :
    `${unit} ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: big ? 6 : 3 }}>
      <Text style={{ color: theme.textMuted, fontSize: big ? 13 : 12, fontWeight: big ? "700" : "400" }}>{label}</Text>
      <Text style={{ color: big ? theme.primary : theme.textPrimary, fontSize: big ? 15 : 12, fontWeight: big ? "800" : "600" }}>{fmt}</Text>
    </View>
  );
}

/**
 * FlexRow — a numeric row that toggles between fixed $ AUD and % of the
 * converted AUD total (USD subtotal × effective FX rate). Shows the
 * *opposite* representation as a live-computed grey helper below the
 * input. Used for the two flexible AUD cost lines (intl transaction
 * fees, duty / CHAFTA).
 */
/**
 * FlexRow — dual-input row showing both the **$ AUD amount** and the
 * **% of a base** side-by-side. Whichever box the user edits last
 * becomes the authoritative value; the other renders as a derived
 * live-computed figure. A small helper note underneath shows the base
 * amount so the atelier always sees the context.
 *
 * Used for Intl transaction fees, Duty / CHAFTA, Markup and GST.
 */
function FlexRow({
  label, mode, pctValue, amountValue, baseAmount, baseLabel = "AUD converted total",
  onModeChange, onPctChange, onAmountChange, onBlur, labelColor, labelWeight = "400",
}: {
  label: string;
  mode: "amount" | "percent";
  pctValue: string;
  amountValue: string;
  baseAmount: number;
  baseLabel?: string;
  onModeChange: (m: "amount" | "percent") => void;
  onPctChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onBlur?: () => void;
  // Optional emphasis for the row label — used to signal the atelier
  // baseline (green = fees/duty, red = GST, yellow = markup).
  labelColor?: string;
  labelWeight?: "400" | "600" | "700" | "800";
}) {
  // Numeric versions for the derivations.
  const pctNum = Number(pctValue) || 0;
  const amtNum = Number(amountValue) || 0;

  // What each box **displays**:
  //   • authoritative side  → the raw string the user typed
  //   • derived / other     → live-computed from the authoritative one
  // Keeping the raw strings preserves partial input (e.g. "1.5" while the
  // user is still typing) — we only derive on the *other* side.
  const displayAmount =
    mode === "amount" ? amountValue : (baseAmount * (pctNum / 100)).toFixed(2);
  const displayPct =
    mode === "percent" ? pctValue :
    (baseAmount > 0 ? ((amtNum / baseAmount) * 100).toFixed(4) : "0");

  const baseFmt = baseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const inputBoxStyle = {
    flex: 1, minWidth: 0, width: 0,
    borderWidth: 1, borderColor: theme.border, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 6, color: theme.textPrimary,
    textAlign: "right" as const,
  };

  return (
    <View style={{ marginBottom: 10 }}>
      {/* Label + both inputs side-by-side */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
        <Text style={{
          color: labelColor || theme.textPrimary,
          fontWeight: labelColor ? "700" : labelWeight,
          flex: 1, fontSize: 13,
        }}>{label}</Text>

        {/* $ box (left) — editing switches mode to "amount" */}
        <View style={{ flexDirection: "row", alignItems: "center", width: 120, marginRight: 8 }}>
          <TextInput
            value={displayAmount}
            onFocus={() => { if (mode !== "amount") onModeChange("amount"); }}
            onChangeText={(v) => {
              // Only flip the mode when it's not already `amount` — firing
              // `onModeChange` on every keystroke used to cause a PATCH
              // storm that raced with itself and reset the field.
              if (mode !== "amount") onModeChange("amount");
              onAmountChange(v);
            }}
            onBlur={onBlur}
            keyboardType="decimal-pad"
            style={{
              ...inputBoxStyle,
              opacity: mode === "amount" ? 1 : 0.55,
            }}
          />
          <Text style={{
            color: theme.textMuted, fontSize: 11, width: 28,
            textAlign: "right", marginLeft: 4,
          }}>$</Text>
        </View>

        {/* % box (right) — editing switches mode to "percent" */}
        <View style={{ flexDirection: "row", alignItems: "center", width: 120 }}>
          <TextInput
            value={displayPct}
            onFocus={() => { if (mode !== "percent") onModeChange("percent"); }}
            onChangeText={(v) => {
              if (mode !== "percent") onModeChange("percent");
              onPctChange(v);
            }}
            onBlur={onBlur}
            keyboardType="decimal-pad"
            style={{
              ...inputBoxStyle,
              opacity: mode === "percent" ? 1 : 0.55,
            }}
          />
          <Text style={{
            color: theme.textMuted, fontSize: 11, width: 28,
            textAlign: "right", marginLeft: 4,
          }}>%</Text>
        </View>
      </View>

      {/* Contextual note under both boxes */}
      <View style={{ marginTop: 2, alignItems: "flex-end" }}>
        <Text style={{ color: theme.textMuted, fontSize: 10 }}>
          {baseLabel}: AUD {baseFmt}
          {"  ·  "}
          <Text style={{ opacity: 0.7 }}>
            editing {mode === "amount" ? "$" : "%"} drives the other
          </Text>
        </Text>
      </View>
    </View>
  );
}


/**
 * MarketAnchorSection — competitor price-anchor comparison card.
 *
 * On mount it loads any cached comparisons for this quote. "Refresh"
 * hits ``POST /api/quotes/{id}/compare`` to trigger a fresh scrape
 * across active sites in the competitor library.
 *
 * Deliberately kept simple in Phase 1: manually triggered, results
 * cached forever per (quote_id, site_id). Auto-trigger + Playwright
 * come in Phase 2.
 */
function MarketAnchorSection({ quoteId }: { quoteId: string }) {
  const [results, setResults] = useState<any[] | null>(null);
  const [criteria, setCriteria] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Full competitor library + admin-editable "selected for this run"
  // set. Defaults to all active sites; admin can uncheck any site to
  // exclude it from THIS run without needing to visit the admin page.
  const [library, setLibrary] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Low-confidence LLM matches (< 0.55) tend to be generic listings that
  // don't actually match the RFQ. Hide them by default; admin can flip
  // the "Show all" chip to inspect the raw scraper output when debugging
  // a site's extraction quality.
  const CONFIDENCE_THRESHOLD = 0.55;
  const [showLowConfidence, setShowLowConfidence] = useState(false);

  const loadCached = useCallback(async () => {
    try {
      const r = await api.getQuoteComparisons(quoteId);
      setResults(r.results || []);
    } catch { /* silent — user can still hit refresh */ }
  }, [quoteId]);

  const loadLibrary = useCallback(async () => {
    try {
      const lib = await api.listCompetitorsAdmin();
      setLibrary(lib);
      // Pre-select every active site so "Run anchors" behaves the same
      // as before unless the admin explicitly deselects one.
      setSelectedIds(new Set(lib.filter(s => s.active).map(s => s.id)));
    } catch { /* non-fatal — admin can still run without the checkboxes */ }
  }, []);

  useEffect(() => { loadCached(); loadLibrary(); }, [loadCached, loadLibrary]);

  const toggleSite = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const refresh = async (force = false) => {
    setBusy(true);
    setError(null);
    try {
      // Only pass the ``sites`` filter when the selection differs from
      // the default (all active). Passing an empty array would run zero
      // sites, which is never what we want.
      const sites = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const r = await api.compareQuote(quoteId, { force, sites });
      setResults(r.results || []);
      setCriteria(r.criteria || null);
    } catch (e: any) {
      // Surface the real cause instead of a bare "Request failed".
      // Two common failure modes on this endpoint:
      //   • Emergent LLM key budget exhausted → 500 with a budget msg
      //   • Ingress timeout on long scrape runs → generic network error
      let msg = e?.message || "";
      if (/budget/i.test(msg)) {
        msg = "Emergent LLM key balance is exhausted — top up your Universal Key (Profile → Universal Key → Add Balance) then retry.";
      } else if (!msg || msg === "Request failed") {
        msg = "Comparison request failed — the scrape may have exceeded the gateway timeout. Try Run anchors (uses cache) instead of Refresh.";
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const totalMatches = (results || []).reduce((s, r) => s + (r.match_count || 0), 0);
  const sitesRun = (results || []).filter(r => (r.match_count || 0) > 0).length;

  // Apply the confidence threshold to each site's matches. Sites with
  // zero matches after filtering are still rendered (so the admin can
  // see the site ran) but their table is replaced with a "filtered out"
  // hint. Toggled off by "Show all" chip.
  const filteredResults = useMemo(() => {
    if (!results) return null;
    if (showLowConfidence) return results;
    return results.map(r => {
      const matches = (r.matches || []).filter(
        (m: any) => Number(m.confidence ?? 0) >= CONFIDENCE_THRESHOLD
      );
      return { ...r, matches, match_count_filtered: matches.length,
        match_count_raw: r.match_count };
    });
  }, [results, showLowConfidence]);

  const hiddenCount = useMemo(() => {
    if (!results || showLowConfidence) return 0;
    return results.reduce((sum, r) => {
      const hidden = (r.matches || []).filter(
        (m: any) => Number(m.confidence ?? 0) < CONFIDENCE_THRESHOLD
      ).length;
      return sum + hidden;
    }, 0);
  }, [results, showLowConfidence]);

  return (
    <Section
      title="Market Anchor"
      subtitle={
        results && results.length
          ? `${totalMatches} pieces from ${sitesRun}/${results.length} competitor sites`
          : "Compare this quote against a library of competitor sites"
      }
      collapsible
      defaultOpen={false}
    >
      {/* Run + Refresh buttons + status */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        {/* Run anchors — uses cache, only fetches missing sites */}
        <TouchableOpacity
          onPress={() => refresh(false)}
          disabled={busy}
          style={{
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6,
            backgroundColor: theme.primary, opacity: busy ? 0.4 : 1,
            flexDirection: "row", alignItems: "center", marginRight: 8,
          }}
        >
          {busy
            ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
            : <Ionicons name="play" size={14} color="#fff" style={{ marginRight: 6 }} />}
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
            {busy ? "Running…" : "Run anchors"}
          </Text>
        </TouchableOpacity>

        {/* Refresh anchors — force re-scrape all sites, bypass cache */}
        <TouchableOpacity
          onPress={() => refresh(true)}
          disabled={busy}
          style={{
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6,
            backgroundColor: "transparent",
            borderWidth: 1, borderColor: theme.primary,
            opacity: busy ? 0.4 : 1,
            flexDirection: "row", alignItems: "center",
          }}
        >
          <Ionicons name="refresh" size={14} color={theme.primary} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 12 }}>
            Refresh anchors
          </Text>
        </TouchableOpacity>

        <Text style={{ color: theme.textMuted, fontSize: 10, marginLeft: 12, flex: 1, minWidth: 140 }}>
          {busy
            ? "Fetching competitor sites — may take up to a minute."
            : "Run uses cache · Refresh forces a fresh scrape (costs LLM tokens)."}
        </Text>
      </View>

      {/* --- Per-run site selector ---------------------------------------
          Small checkbox row that lets admin pause any competitor for THIS
          run without visiting the Competitor Library page. Chips of paused
          (library.active=false) sites are hidden — manage those in
          /admin/competitors. */}
      {library.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ color: theme.textMuted, fontSize: 10, flex: 1 }}>
              Sites for this run · {selectedIds.size} selected / {library.filter(s => s.active).length} available
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedIds(new Set(library.filter(s => s.active).map(s => s.id)))}
              style={{ marginRight: 8 }}
            >
              <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "700" }}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectedIds(new Set())}>
              <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: "700" }}>None</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {library.filter(s => s.active).map(s => {
              const on = selectedIds.has(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => toggleSite(s.id)}
                  style={{
                    flexDirection: "row", alignItems: "center",
                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
                    borderWidth: 1, borderColor: on ? theme.primary : theme.border,
                    backgroundColor: on ? "#2A2A1A" : "transparent",
                    marginRight: 4, marginBottom: 4,
                  }}
                >
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={12}
                    color={on ? theme.primary : theme.textMuted}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={{ color: on ? theme.textPrimary : theme.textMuted, fontSize: 10 }}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {error && (
        <Text style={{ color: "#E06666", fontSize: 11, marginBottom: 8 }}>{error}</Text>
      )}

      {criteria && (
        <View style={{ backgroundColor: "#0a0a0a", padding: 8, borderRadius: 6, marginBottom: 10 }}>
          <Text style={{ color: theme.textMuted, fontSize: 10 }}>
            Matching: {Object.entries(criteria).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("  ·  ") || "(no RFQ specs on this quote)"}
          </Text>
        </View>
      )}

      {/* Confidence filter toggle — hides < 0.55 confidence matches by
          default. Click to inspect raw scraper output when a site's
          extraction quality looks off. */}
      {results && results.length > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <TouchableOpacity
            onPress={() => setShowLowConfidence(v => !v)}
            style={{
              flexDirection: "row", alignItems: "center",
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
              borderWidth: 1,
              borderColor: showLowConfidence ? theme.primary : theme.border,
              backgroundColor: showLowConfidence ? "#2A2A1A" : "transparent",
              marginRight: 8,
            }}
          >
            <Ionicons
              name={showLowConfidence ? "eye" : "eye-off"}
              size={12}
              color={showLowConfidence ? theme.primary : theme.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text style={{
              color: showLowConfidence ? theme.textPrimary : theme.textMuted,
              fontSize: 10, fontWeight: "700",
            }}>
              {showLowConfidence ? "Showing all confidence" : `Hiding low confidence < ${Math.round(CONFIDENCE_THRESHOLD * 100)}%`}
            </Text>
          </TouchableOpacity>
          {hiddenCount > 0 && !showLowConfidence && (
            <Text style={{ color: theme.textMuted, fontSize: 10 }}>
              {hiddenCount} match{hiddenCount === 1 ? "" : "es"} hidden
            </Text>
          )}
        </View>
      )}

      {(filteredResults || []).map((r) => (
        <View key={r.site_id} style={{
          borderWidth: 1, borderColor: theme.border, borderRadius: 8,
          padding: 10, marginBottom: 8, backgroundColor: "#0d0d0d",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "700", flex: 1 }}>
              {r.site_name}
            </Text>
            <Text style={{
              color: r.error ? "#E06666" : (r.match_count > 0 ? theme.primary : theme.textMuted),
              fontSize: 10, fontWeight: "600",
            }}>
              {r.error
                ? "error"
                : (r as any).match_count_raw !== undefined && (r as any).match_count_raw !== r.matches.length
                  ? `${r.matches.length}/${(r as any).match_count_raw} match${(r as any).match_count_raw === 1 ? "" : "es"}`
                  : `${r.match_count} match${r.match_count === 1 ? "" : "es"}`}
            </Text>
          </View>
          {r.error && (
            <Text style={{ color: theme.textMuted, fontSize: 10, marginBottom: 4 }}>{r.error}</Text>
          )}
          {!r.error
            && r.matches.length === 0
            && (r as any).match_count_raw > 0
            && !showLowConfidence
            && (
              <Text style={{ color: theme.textMuted, fontSize: 10, fontStyle: "italic", marginBottom: 4 }}>
                {(r as any).match_count_raw} low-confidence match
                {(r as any).match_count_raw === 1 ? "" : "es"} hidden — tap the toggle above to see them.
              </Text>
            )}
          {(r.matches || []).map((m: any, idx: number) => (
            <View key={idx} style={{
              paddingVertical: 6,
              borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: "#1a1a1a",
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "600" }}>
                    {m.product_name || "(unnamed)"}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 2 }}>
                    {[
                      m.metal, m.diamond_ct ? `${m.diamond_ct}ct` : null,
                      m.shape, m.cut, m.color, m.clarity,
                    ].filter(Boolean).join(" · ") || "no spec"}
                  </Text>
                  {m.snippet && (
                    <Text style={{ color: theme.textMuted, fontSize: 9, marginTop: 3, fontStyle: "italic" }} numberOfLines={2}>
                      “{m.snippet}”
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {(() => {
                    // Prefer the LLM-captured native price + currency.
                    // Fall back to the legacy AUD-only field for older
                    // cached snapshots.
                    const native = m.price_native != null ? Number(m.price_native) : null;
                    const currency = (m.price_currency || "").toString().toUpperCase();
                    const legacyAud = m.price_aud != null ? Number(m.price_aud) : null;
                    const [amount, code] = native != null && native > 0 && currency
                      ? [native, currency]
                      : [legacyAud || 0, "AUD"];
                    return (
                      <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "700" }}>
                        {code} {amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Text>
                    );
                  })()}
                  <Text style={{ color: theme.textMuted, fontSize: 9 }}>
                    conf {Math.round(Number(m.confidence || 0) * 100)}%
                  </Text>
                </View>
              </View>
              {m.url && (
                <TouchableOpacity onPress={() => Linking.openURL(m.url).catch(() => {})}>
                  <Text style={{ color: "#7CA8E8", fontSize: 10, marginTop: 3 }}>
                    ▶ view source →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      ))}

      {!results?.length && !busy && (
        <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: "center", padding: 12 }}>
          No comparisons yet — tap &ldquo;Run comparison&rdquo; to fetch prices from
          competitor sites.
        </Text>
      )}
    </Section>
  );
}



// ---------- Screen ----------
export default function QuoteDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const qid = String(params.id || "");
  const safeBack = useSafeBack("/(app)/admin/quotes");
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"pdf" | "dup" | "del" | null>(null);

  const [quote, setQuote] = useState<any | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<any>(null);
  const [fx, setFx] = useState<{
    rate: number; fetched_at: string; source: string; stale?: boolean;
  } | null>(null);
  const [fxLoading, setFxLoading] = useState(false);

  const load = useCallback(async () => {
    try { setQuote(await api.getQuote(qid)); }
    catch (e: any) { Alert.alert("Load failed", e?.message || "unknown"); }
  }, [qid]);

  // Fetch (cached) live USD→AUD rate on mount. Provides the anchor for
  // the "live rate + adjustment %" workflow. Any failure is silent —
  // the manual field still works.
  const loadFx = useCallback(async (force = false) => {
    setFxLoading(true);
    try {
      const r = await api.getUsdAudRate(force);
      setFx({
        rate: r.rate,
        fetched_at: r.fetched_at,
        source: r.source,
        stale: r.stale,
      });
    } catch { /* silent — manual field remains usable */ }
    finally { setFxLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadFx(false); }, [loadFx]);

  /**
   * Auto-sync per-unit fields when their bulk/divisor drivers change.
   *
   * Rule (mirrors the ``recompute`` helpers inside the two custom rows):
   *   • divisor > 0        → per-unit = bulk / divisor  (multi-piece shipment)
   *   • divisor 0 / blank  → per-unit = bulk            (bulk-split OFF)
   *
   * Runs whenever the driver values on ``quote.inputs`` change — including
   * the initial GET response — so quotes created before the bulk/divisor
   * feature (with a stale per-unit value burned in) self-correct without
   * requiring the admin to blur any field manually.
   *
   * Idempotent: silently returns if the stored per-unit already matches
   * the derived value (within 1c tolerance), so we don't ping-pong PATCHes.
   */
  useEffect(() => {
    if (!quote?.inputs) return;
    const i = quote.inputs;
    const patches: Record<string, number> = {};
    // Air freight (USD)
    const afBulk = Number(i.air_freight_bulk_cost_usd);
    const afDiv  = Number(i.air_freight_divisor);
    if (Number.isFinite(afBulk) && afBulk > 0) {
      const expected = (Number.isFinite(afDiv) && afDiv > 0)
        ? Math.round((afBulk / afDiv) * 100) / 100
        : afBulk;
      if (Math.abs(expected - Number(i.air_freight_cost_usd || 0)) > 0.01) {
        patches.air_freight_cost_usd = expected;
      }
    }
    // Customs clearance (AUD)
    const ccBulk = Number(i.custom_clearance_bulk_aud);
    const ccDiv  = Number(i.custom_clearance_divisor);
    if (Number.isFinite(ccBulk) && ccBulk > 0) {
      const expected = (Number.isFinite(ccDiv) && ccDiv > 0)
        ? Math.round((ccBulk / ccDiv) * 100) / 100
        : ccBulk;
      if (Math.abs(expected - Number(i.custom_clearance_aud || 0)) > 0.01) {
        patches.custom_clearance_aud = expected;
      }
    }
    if (Object.keys(patches).length === 0) return;
    const nextInputs = { ...i, ...patches };
    setQuote((q: any) => ({ ...q, inputs: nextInputs }));
    persist({ inputs: nextInputs });
    // Depend on the driver fields only — depending on the derived
    // per-unit fields would cause an infinite update loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    quote?.inputs?.air_freight_bulk_cost_usd,
    quote?.inputs?.air_freight_divisor,
    quote?.inputs?.custom_clearance_bulk_aud,
    quote?.inputs?.custom_clearance_divisor,
  ]);

  // Live preview totals (debounced) — server-side authoritative
  useEffect(() => {
    if (!quote?.inputs) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.computeQuoteTotals(quote.inputs);
        setPreview(r);
      } catch { /* ignore */ }
    }, 400);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [quote?.inputs]);

  // Field mutators — never mutate state directly, always fresh object
  const setInput = (k: string, v: any) => {
    setQuote((q: any) => ({ ...q, inputs: { ...q.inputs, [k]: v } }));
  };
  const setNumeric = (k: string) => (raw: string) => {
    setInput(k, raw === "" ? 0 : Number(raw));
  };

  const persist = async (patch: any) => {
    setSaving(true);
    try { setQuote(await api.patchQuote(qid, patch)); }
    catch (e: any) { Alert.alert("Save failed", e?.message || "unknown"); }
    finally { setSaving(false); }
  };
  const commitInputs = () => quote && persist({ inputs: quote.inputs });
  const commitStatus = (s: string) => persist({ status: s });

  /**
   * Set a single input **and** persist it in one atomic step.
   *
   * Fixes a stale-closure bug: switches / pill toggles used to call
   * ``setInput(k, v)`` immediately followed by ``setTimeout(commitInputs)``.
   * Because ``commitInputs`` captures ``quote`` from render-time closure,
   * that timer would PATCH the **pre-toggle** inputs, and the server
   * response then overwrote the optimistic state — making the toggle
   * appear to "revert" on its own.
   *
   * By computing ``nextInputs`` deterministically here and passing it
   * straight to ``persist``, we avoid ever depending on React having
   * flushed the state update first.
   */
  const commitField = (k: string, v: any) => {
    if (!quote) return;
    const nextInputs = { ...quote.inputs, [k]: v };
    setQuote((q: any) => ({ ...q, inputs: nextInputs }));
    persist({ inputs: nextInputs });
  };

  // ---------- Discount tier helpers ----------
  const addTier = () => {
    const current = quote.inputs?.discount_tiers || [];
    const next = [...current, { label: `Tier ${current.length + 1}`, discount_pct: 10 }];
    setInput("discount_tiers", next);
    setTimeout(commitInputs, 0);
  };
  const removeTier = (idx: number) => {
    const next = [...(quote.inputs?.discount_tiers || [])].filter((_, i) => i !== idx);
    setInput("discount_tiers", next);
    setTimeout(commitInputs, 0);
  };
  const setTierField = (idx: number, key: string, value: any) => {
    const next = [...(quote.inputs?.discount_tiers || [])];
    next[idx] = { ...next[idx], [key]: value };
    setInput("discount_tiers", next);
  };

  // Preview totals if available, else persisted totals
  const shownTotals = preview?.totals || preview || quote?.totals;
  // computeQuoteTotals response shape: { inputs, totals } — normalise
  const t = (shownTotals && (shownTotals.totals || shownTotals)) as any;
  const tiers: any[] = t?.discount_tiers || quote?.inputs?.discount_tiers || [];

  // Client-side USD subtotal — mirrors `compute_totals` on the server
  // so the "Total USD costs" line updates instantly as the user types,
  // even before the debounced server preview lands.
  const usdSubtotal = useMemo(() => {
    const i = quote?.inputs || {};
    return (
      (Number(i.ring_cost_usd) || 0) +
      (i.includes_hidden_halo_pave ? (Number(i.hidden_halo_pave_cost_usd) || 0) : 0) +
      (Number(i.extra_cut_cost_usd) || 0) +
      (Number(i.cad_rendering_cost_usd) || 0) +
      (Number(i.provenance_cost_usd) || 0) +
      (Number(i.certification_cost_usd) || 0) +
      (Number(i.box_packaging_cost_usd) || 0) +
      (Number(i.air_freight_cost_usd) || 0)
    );
  }, [quote?.inputs]);

  // Effective FX rate = live mid-market rate × (1 + adjustment%).
  // Falls back gracefully when either half of the pair is missing.
  const adjustmentPct = Number(quote?.inputs?.fx_adjustment_pct ?? 0);
  const effectiveLiveRate = useMemo(() => {
    if (!fx?.rate) return null;
    return fx.rate * (1 + adjustmentPct / 100);
  }, [fx?.rate, adjustmentPct]);

  const applyLiveRate = () => {
    if (effectiveLiveRate == null || !quote) return;
    const rounded = Math.round(effectiveLiveRate * 10000) / 10000;
    const nextInputs = {
      ...quote.inputs,
      fx_live_rate: fx?.rate,
      fx_adjustment_pct: adjustmentPct,
      usd_to_aud_rate: rounded,
    };
    setQuote((q: any) => ({ ...q, inputs: nextInputs }));
    // Persist directly using the freshly-built inputs so we don't race
    // React's state batching.
    persist({ inputs: nextInputs });
  };

  // ---------- Quote-level actions: PDF / Duplicate / Delete ------------
  /**
   * Export the current quote as a PDF. On web we fetch the blob (so we
   * can attach the auth header) and open it in a new tab / trigger the
   * browser's built-in download UI. On native we rely on the platform
   * default browser via `Linking.openURL` — the endpoint accepts the
   * bearer token from the app's authorised session cookie/proxy.
   */
  const handleExportPdf = async () => {
    if (!quote) return;
    setBusyAction("pdf");
    try {
      const blob = await api.fetchQuotePdf(qid);
      const filename = `Somnio-Quote-${quote.freelance_serial || quote.order_ref || qid.slice(0, 8)}.pdf`;
      if (Platform.OS === "web") {
        // Trigger a browser download / new-tab preview.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke a moment later so the tab has time to load first.
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        // Native — fall back to opening the URL directly. The PDF
        // endpoint uses inline disposition so mobile browsers will
        // render it in-app. Persistent auth is handled by the shared
        // session cookie.
        Linking.openURL(api.quotePdfUrl(qid));
      }
    } catch (e: any) {
      Alert.alert("PDF export failed", e?.message || "Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  /**
   * Duplicate the current quote — creates a fresh draft with the same
   * inputs / jewelry_name and navigates to it. Freelance quotes get a
   * new dwj- serial (never reuses the source counter).
   */
  const handleDuplicate = async () => {
    if (!quote) return;
    setBusyAction("dup");
    try {
      const dup = await api.duplicateQuote(qid);
      // Navigate to the new quote — router.replace so back-button pops
      // out to /admin/quotes rather than the original quote.
      if (dup?.id) {
        router.replace(`/(app)/admin/quotes/${dup.id}` as any);
      } else {
        Alert.alert("Duplicated", "Quote duplicated — refresh the quote list to see it.");
      }
    } catch (e: any) {
      Alert.alert("Duplicate failed", e?.message || "Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  /**
   * Soft-delete the current quote after a confirmation prompt. On
   * success navigate back to the quotes list.
   */
  const handleDelete = () => {
    if (!quote) return;
    const doDelete = async () => {
      setBusyAction("del");
      try {
        await api.deleteQuote(qid);
        safeBack();
      } catch (e: any) {
        Alert.alert("Delete failed", e?.message || "Please try again.");
      } finally {
        setBusyAction(null);
      }
    };
    if (Platform.OS === "web") {
      // Native Alert.alert on web is non-blocking / renders no buttons,
      // so use `confirm` to actually gate the action.
      if (typeof window !== "undefined" && window.confirm(
        "Delete this quote? It will be soft-deleted and can be recovered by an admin.",
      )) {
        doDelete();
      }
      return;
    }
    Alert.alert(
      "Delete quote?",
      "This quote will be soft-deleted. Recoverable by an admin.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ],
    );
  };

  if (!quote) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
        <TouchableOpacity onPress={safeBack}><Ionicons name="arrow-back" size={22} color={theme.textPrimary} /></TouchableOpacity>
        {/* Editable heading title — falls back to piece_description
            when jewelry_name is empty. Commits on blur so users can
            rename mid-type without triggering a request per keystroke. */}
        <TextInput
          value={String(quote.jewelry_name ?? "")}
          onChangeText={(v) => setQuote((q: any) => ({ ...q, jewelry_name: v }))}
          onBlur={() => persist({ jewelry_name: quote.jewelry_name ?? "" })}
          placeholder={quote.inputs?.piece_description || "Untitled quote"}
          placeholderTextColor={theme.textMuted}
          style={{
            flex: 1, textAlign: "center",
            fontSize: 16, fontWeight: "700", color: theme.textPrimary,
            paddingVertical: 4, paddingHorizontal: 6,
            borderBottomWidth: 1, borderBottomColor: "transparent",
          }}
          numberOfLines={1}
        />
        {saving ? <ActivityIndicator size="small" color={theme.primary} /> : <View style={{ width: 22 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 60, maxWidth: 520, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
        {/* --- Header card: serial + RFQ + status pills --- */}
        {(quote.serial_display || quote.rfq_id) && (
          <View style={{ backgroundColor: "#0F1F1F", padding: spacing.md, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: theme.primary }}>
            {quote.serial_display && (
              <>
                <Text style={{ color: theme.primary, fontWeight: "800", fontSize: 16 }}>{quote.serial_display}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>engraved: {quote.serial_engraved}</Text>
              </>
            )}
            {quote.rfq_id && (
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>from RFQ {quote.rfq_id.slice(0, 8)}…</Text>
            )}
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 6, marginTop: spacing.md }}>
          {STATUSES.map(s => {
            const active = quote.status === s.key;
            return (
              <TouchableOpacity key={s.key} onPress={() => commitStatus(s.key)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 6,
                  backgroundColor: active ? s.color : "transparent",
                  borderWidth: 1, borderColor: active ? s.color : theme.border,
                }}>
                <Text style={{ color: active ? "#fff" : theme.textPrimary, textAlign: "center", fontWeight: "700", fontSize: 12, textTransform: "uppercase" }}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* --- Quote actions — PDF / Duplicate / Delete ----------------
            Sits directly under the status pills so admin can archive,
            fork or discard the quote in one place. Delete is soft (the
            quote can be recovered from the recycler by another admin). */}
        <View style={{ flexDirection: "row", gap: 6, marginTop: spacing.sm }}>
          <TouchableOpacity
            onPress={handleExportPdf}
            disabled={busyAction !== null}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
              paddingVertical: 8, borderRadius: 6,
              borderWidth: 1, borderColor: theme.primary,
              opacity: busyAction && busyAction !== "pdf" ? 0.4 : 1,
            }}
          >
            {busyAction === "pdf"
              ? <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 6 }} />
              : <Ionicons name="document-text-outline" size={14} color={theme.primary} style={{ marginRight: 6 }} />}
            <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 11, textTransform: "uppercase" }}>
              Export PDF
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDuplicate}
            disabled={busyAction !== null}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
              paddingVertical: 8, borderRadius: 6,
              borderWidth: 1, borderColor: theme.primary,
              opacity: busyAction && busyAction !== "dup" ? 0.4 : 1,
            }}
          >
            {busyAction === "dup"
              ? <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 6 }} />
              : <Ionicons name="copy-outline" size={14} color={theme.primary} style={{ marginRight: 6 }} />}
            <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 11, textTransform: "uppercase" }}>
              Duplicate
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDelete}
            disabled={busyAction !== null}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
              paddingVertical: 8, borderRadius: 6,
              borderWidth: 1, borderColor: "#B84A4A",
              opacity: busyAction && busyAction !== "del" ? 0.4 : 1,
            }}
          >
            {busyAction === "del"
              ? <ActivityIndicator size="small" color="#B84A4A" style={{ marginRight: 6 }} />
              : <Ionicons name="trash-outline" size={14} color="#B84A4A" style={{ marginRight: 6 }} />}
            <Text style={{ color: "#B84A4A", fontWeight: "700", fontSize: 11, textTransform: "uppercase" }}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>

        {/* --- Product spec --- */}
        <Section title="Product Spec" subtitle="Descriptive fields printed on the client-facing quote">
          {/* Free-form piece description */}
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 2 }}>Piece description</Text>
            <TextInput
              value={String(quote.inputs?.piece_description ?? "")}
              onChangeText={(v) => setInput("piece_description", v)}
              onBlur={commitInputs}
              placeholder="e.g. Ring — OV 4ct in 18k WG"
              placeholderTextColor="#555"
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 6, padding: 8, color: theme.textPrimary }}
            />
          </View>

          {/* --- Metal spec — atomic Type + Weight row --- */}
          {(() => {
            const i = quote.inputs || {};
            const composeMetalSpec = (over: Record<string, any> = {}) => {
              const v = { ...i, ...over };
              const parts: string[] = [];
              const t = String(v.metal_type || "").trim();
              const w = v.metal_weight_g;
              if (t) parts.push(t);
              if (w !== "" && w != null && Number(w) > 0) parts.push(`${w}g`);
              return parts.join(", ");
            };
            const commitMetalAndCompose = () => {
              setInput("metal_spec", composeMetalSpec());
              setTimeout(commitInputs, 0);
            };
            return (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 4 }}>Metal spec</Text>
                <View style={{ flexDirection: "row" }}>
                  {/* Metal type — larger flex */}
                  <View style={{ flex: 2, minWidth: 0, marginRight: 6 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 10, marginBottom: 2 }}>Type</Text>
                    <TextInput
                      value={String(i.metal_type ?? "")}
                      onChangeText={(v) => setInput("metal_type", v)}
                      onBlur={commitMetalAndCompose}
                      placeholder="e.g. 18K White Gold"
                      placeholderTextColor="#555"
                      style={{
                        borderWidth: 1, borderColor: theme.border, borderRadius: 6,
                        paddingHorizontal: 8, paddingVertical: 6,
                        color: theme.textPrimary, fontSize: 12,
                      }}
                    />
                  </View>
                  {/* Weight in grams */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 10, marginBottom: 2 }}>Weight (g)</Text>
                    <TextInput
                      value={String(i.metal_weight_g ?? "")}
                      // Store raw string during typing — see Carat above
                      // for the trailing-decimal reasoning.
                      onChangeText={(v) => setInput("metal_weight_g", v)}
                      onBlur={commitMetalAndCompose}
                      placeholder="6"
                      placeholderTextColor="#555"
                      keyboardType="decimal-pad"
                      style={{
                        borderWidth: 1, borderColor: theme.border, borderRadius: 6,
                        paddingHorizontal: 8, paddingVertical: 6,
                        color: theme.textPrimary, fontSize: 12,
                      }}
                    />
                  </View>
                </View>
                {/* Composed preview */}
                <Text
                  style={{
                    color: theme.textMuted, fontSize: 10, marginTop: 6,
                    fontStyle: composeMetalSpec() ? "normal" : "italic",
                  }}
                >
                  {composeMetalSpec() || "e.g. 18K White Gold, 6g"}
                </Text>
              </View>
            );
          })()}

          {/* --- Stone spec — atomic 5-field row --- */}
          {(() => {
            const i = quote.inputs || {};
            // Compose the human-readable ``stone_spec`` from the atoms.
            // Skips empty parts so partial specs still read cleanly.
            const composeStoneSpec = (over: Record<string, any> = {}) => {
              const v = { ...i, ...over };
              const parts: string[] = [];
              const type = String(v.diamond_type || "").trim();
              const ct   = v.diamond_carat;
              const sh   = String(v.diamond_shape || "").trim();
              const col  = String(v.diamond_color || "").trim();
              const cla  = String(v.diamond_clarity || "").trim();
              if (type)               parts.push(`${type} diamond`);
              if (ct !== "" && ct != null && Number(ct) > 0) parts.push(`${ct}ct`);
              if (sh)                 parts.push(sh);
              if (col)                parts.push(col);
              if (cla)                parts.push(cla);
              return parts.join(" | ");
            };
            const commitAtomsAndCompose = () => {
              // Recompose stone_spec from atoms and persist together.
              setInput("stone_spec", composeStoneSpec());
              setTimeout(commitInputs, 0);
            };
            /**
             * Deterministic single-atom commit — mirrors ``commitField``
             * but also refreshes the composed ``stone_spec`` in the same
             * atomic PATCH, so pill / segmented toggles (Lab / Natural)
             * never race a stale-closure ``commitInputs`` timer.
             */
            const commitAtom = (key: string, value: any) => {
              if (!quote) return;
              const nextInputs: any = { ...(quote.inputs || {}), [key]: value };
              nextInputs.stone_spec = composeStoneSpec({ [key]: value });
              setQuote((q: any) => ({ ...q, inputs: nextInputs }));
              persist({ inputs: nextInputs });
            };
            const applyPrefill = async () => {
              try {
                const r = await api.getStoneSpecPrefill(qid);
                if (r.source !== "rfq") {
                  Alert.alert("No linked RFQ", "This quote has no source RFQ to pull specs from.");
                  return;
                }
                // Detect whether any current atom (stone OR metal) is
                // non-empty — if so, confirm before overwriting.
                const dirtyKeys = [
                  "diamond_type", "diamond_carat", "diamond_shape",
                  "diamond_color", "diamond_clarity",
                  "metal_type", "metal_weight_g",
                ];
                const dirty = dirtyKeys.some(k => {
                  const v = (quote.inputs || {})[k];
                  return v !== undefined && v !== null && v !== ""
                    && !(typeof v === "number" && v === 0);
                });
                const doApply = () => {
                  const patch = {
                    ...quote.inputs,
                    ...(r.atoms || {}),
                    stone_spec: (r as any).composed_stone || r.composed || "",
                    metal_spec: (r as any).composed_metal || "",
                  };
                  setQuote((q: any) => ({ ...q, inputs: patch }));
                  setTimeout(() => persist({ inputs: patch }), 0);
                };
                if (dirty) {
                  const previewLines = [
                    (r as any).composed_metal && `Metal: ${(r as any).composed_metal}`,
                    ((r as any).composed_stone || r.composed) && `Stone: ${(r as any).composed_stone || r.composed}`,
                  ].filter(Boolean).join("\n") || "(empty)";
                  Alert.alert(
                    "Overwrite specs?",
                    `Pulling from RFQ will replace current values with:\n\n${previewLines}`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Overwrite", style: "destructive", onPress: doApply },
                    ],
                  );
                } else {
                  doApply();
                }
              } catch (e: any) {
                Alert.alert("Prefill failed", e?.message || "unknown");
              }
            };
            const type = String(i.diamond_type || "").toLowerCase();
            // Reusable style so the 4 inline TextInputs stay consistent.
            const cellStyle = {
              borderWidth: 1, borderColor: theme.border, borderRadius: 6,
              paddingHorizontal: 8, paddingVertical: 6,
              color: theme.textPrimary, fontSize: 12,
            } as const;
            const cellLabel = { color: theme.textMuted, fontSize: 10, marginBottom: 2 } as const;
            return (
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 11, flex: 1 }}>Stone spec</Text>
                  {quote.rfq_id && (
                    <TouchableOpacity
                      onPress={applyPrefill}
                      style={{
                        flexDirection: "row", alignItems: "center",
                        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
                        borderWidth: 1, borderColor: theme.primary,
                      }}
                    >
                      <Ionicons name="download-outline" size={11} color={theme.primary} style={{ marginRight: 4 }} />
                      <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "700" }}>
                        Pull from RFQ
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Type toggle — lab / natural */}
                <View style={{ flexDirection: "row", marginBottom: 6 }}>
                  {(["lab", "natural"] as const).map((opt) => {
                    const active = type === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => commitAtom("diamond_type", opt)}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
                          borderWidth: 1, borderColor: active ? theme.primary : theme.border,
                          backgroundColor: active ? theme.primary : "transparent",
                          marginRight: 6,
                        }}
                      >
                        <Text style={{
                          color: active ? "#fff" : theme.textPrimary,
                          fontSize: 11, fontWeight: "700", textTransform: "capitalize",
                        }}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 4 atoms in one row: Carat | Shape | Color | Clarity
                    Inlined (not a nested component) so React doesn't
                    unmount + remount them on every keystroke, which
                    would lose focus and drop uncommitted text. */}
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <View style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
                    <Text style={cellLabel}>Carat</Text>
                    <TextInput
                      value={String(i.diamond_carat ?? "")}
                      // Store the raw string during typing. Converting to
                      // Number on each keystroke would strip trailing
                      // decimals — "1." → Number("1.") = 1 → next char
                      // concatenates as "17" instead of "1.7". Pydantic
                      // coerces the string to float on the server side.
                      onChangeText={(v) => setInput("diamond_carat", v)}
                      onBlur={commitAtomsAndCompose}
                      placeholder="3"
                      placeholderTextColor="#555"
                      keyboardType="decimal-pad"
                      style={cellStyle}
                    />
                  </View>
                  <View style={{ flex: 1.4, minWidth: 0, marginRight: 6 }}>
                    <Text style={cellLabel}>Shape</Text>
                    <TextInput
                      value={String(i.diamond_shape ?? "")}
                      onChangeText={(v) => setInput("diamond_shape", v)}
                      onBlur={commitAtomsAndCompose}
                      placeholder="Round"
                      placeholderTextColor="#555"
                      style={cellStyle}
                    />
                  </View>
                  <View style={{ flex: 0.9, minWidth: 0, marginRight: 6 }}>
                    <Text style={cellLabel}>Color</Text>
                    <TextInput
                      value={String(i.diamond_color ?? "")}
                      onChangeText={(v) => setInput("diamond_color", v)}
                      onBlur={commitAtomsAndCompose}
                      placeholder="D"
                      placeholderTextColor="#555"
                      style={cellStyle}
                    />
                  </View>
                  <View style={{ flex: 1.1, minWidth: 0 }}>
                    <Text style={cellLabel}>Clarity</Text>
                    <TextInput
                      value={String(i.diamond_clarity ?? "")}
                      onChangeText={(v) => setInput("diamond_clarity", v)}
                      onBlur={commitAtomsAndCompose}
                      placeholder="VVS2"
                      placeholderTextColor="#555"
                      style={cellStyle}
                    />
                  </View>
                </View>

                {/* Composed preview (what will print on the client quote) */}
                <Text
                  style={{
                    color: theme.textMuted, fontSize: 10, marginTop: 6,
                    fontStyle: composeStoneSpec() ? "normal" : "italic",
                  }}
                >
                  {composeStoneSpec() || "e.g. lab diamond | 3ct | Round | D | VVS2"}
                </Text>
              </View>
            );
          })()}
        </Section>

        {/* --- USD costs --- */}
        <Section title="USD Costs" subtitle="Line-items sourced from the manufacturer (converted at the FX rate below)">
          <NumRow label="Ring cost" suffix="USD"
            value={String(quote.inputs?.ring_cost_usd ?? "")}
            onChangeText={setNumeric("ring_cost_usd")} onBlur={commitInputs} />

          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ color: theme.textPrimary, flex: 1, fontSize: 13 }}>Includes hidden halo pavé</Text>
            <Switch
              value={!!quote.inputs?.includes_hidden_halo_pave}
              onValueChange={(v) => commitField("includes_hidden_halo_pave", v)}
            />
          </View>
          <NumRow
            label="  ↳ Hidden halo pavé cost" suffix="USD"
            disabled={!quote.inputs?.includes_hidden_halo_pave}
            value={String(quote.inputs?.hidden_halo_pave_cost_usd ?? "")}
            onChangeText={setNumeric("hidden_halo_pave_cost_usd")} onBlur={commitInputs}
          />

          {USD_FIELDS
            .filter(f => f.key !== "ring_cost_usd" && f.key !== "air_freight_cost_usd")
            .map(f => (
              <NumRow key={f.key} label={f.label} suffix={f.suffix}
                value={String(quote.inputs?.[f.key] ?? "")}
                onChangeText={setNumeric(f.key)} onBlur={commitInputs} />
            ))}

          {/* --- Air freight — bulk cost ÷ divisor = per-unit --------------
              Admin enters the total bulk shipment cost + how many pieces
              share the shipment. Per-unit is auto-populated into the
              existing ``air_freight_cost_usd`` field (still admin-
              overridable, since some quotes have a fixed per-piece
              rate rather than a bulk allocation). Bulk + divisor are
              persisted so the derivation is auditable and re-editable. */}
          {(() => {
            const bulkStr = String(quote.inputs?.air_freight_bulk_cost_usd ?? "");
            const divStr = String(quote.inputs?.air_freight_divisor ?? "");
            const perStr = String(quote.inputs?.air_freight_cost_usd ?? "");
            /**
             * Recompute per-unit from bulk + divisor and PATCH all three
             * fields atomically to sidestep stale-closure races.
             */
            const recompute = (patch: Record<string, any>) => {
              if (!quote) return;
              const nextInputs = { ...(quote.inputs || {}), ...patch };
              const bulk = Number(nextInputs.air_freight_bulk_cost_usd);
              const div  = Number(nextInputs.air_freight_divisor);
              // divisor > 0 → per-unit = bulk / divisor (multi-piece shipment).
              // divisor 0 / blank → bulk-split OFF, per-unit = bulk directly.
              if (Number.isFinite(bulk)) {
                nextInputs.air_freight_cost_usd = (Number.isFinite(div) && div > 0)
                  ? Math.round((bulk / div) * 100) / 100
                  : bulk;
              }
              setQuote((q: any) => ({ ...q, inputs: nextInputs }));
              persist({ inputs: nextInputs });
            };
            const cellStyle = {
              flex: 1, minWidth: 0, width: 0,
              borderWidth: 1, borderColor: theme.border, borderRadius: 6,
              paddingHorizontal: 8, paddingVertical: 6,
              color: theme.textPrimary, textAlign: "right" as const, fontSize: 12,
            };
            return (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ color: theme.textPrimary, flex: 1, fontSize: 13 }}>Air freight</Text>
                {/* Bulk shipment cost (USD) */}
                <View style={{ flexDirection: "row", alignItems: "center", width: 100, marginRight: 4 }}>
                  <TextInput
                    value={bulkStr}
                    onChangeText={(v) => setInput("air_freight_bulk_cost_usd", v)}
                    onBlur={() => recompute({ air_freight_bulk_cost_usd: Number(bulkStr) || 0 })}
                    placeholder="Bulk"
                    placeholderTextColor="#555"
                    keyboardType="decimal-pad"
                    style={cellStyle}
                  />
                </View>
                {/* Divisor "÷" */}
                <Text style={{ color: theme.textMuted, fontSize: 12, marginHorizontal: 2 }}>÷</Text>
                <View style={{ flexDirection: "row", alignItems: "center", width: 60, marginRight: 4 }}>
                  <TextInput
                    value={divStr}
                    onChangeText={(v) => setInput("air_freight_divisor", v)}
                    onBlur={() => recompute({ air_freight_divisor: Number(divStr) || 0 })}
                    placeholder="qty"
                    placeholderTextColor="#555"
                    keyboardType="decimal-pad"
                    style={cellStyle}
                  />
                </View>
                {/* Per-unit "=" — auto-computed but still editable */}
                <Text style={{ color: theme.textMuted, fontSize: 12, marginHorizontal: 2 }}>=</Text>
                <View style={{ flexDirection: "row", alignItems: "center", width: 100 }}>
                  <TextInput
                    value={perStr}
                    onChangeText={(v) => setInput("air_freight_cost_usd", v)}
                    onBlur={commitInputs}
                    keyboardType="decimal-pad"
                    style={cellStyle}
                  />
                  <Text style={{ color: theme.textMuted, fontSize: 11, width: 32, textAlign: "right", marginLeft: 4 }}>USD</Text>
                </View>
              </View>
            );
          })()}

          {/* --- Pre-FX USD subtotal (live, client-side) --- */}
          <View style={{
            marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border,
            flexDirection: "row", justifyContent: "space-between", alignItems: "center",
          }}>
            <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "700" }}>
              Total USD costs (pre-FX)
            </Text>
            <Text style={{ color: theme.primary, fontSize: 14, fontWeight: "800" }}>
              USD {usdSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </Section>

        {/* --- FX --- */}
        <Section
          title="Currency Conversion"
          subtitle="Live mid-market USD→AUD, refreshed once daily, plus your bank buffer"
        >
          {/* Live rate chip */}
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            backgroundColor: "#0F1F1F", padding: 10, borderRadius: 8, marginBottom: 8,
            borderWidth: 1, borderColor: fx?.stale ? "#E0A44A" : theme.border,
          }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name={fx?.stale ? "warning-outline" : "trending-up-outline"}
                  size={14}
                  color={fx?.stale ? "#E0A44A" : theme.primary}
                />
                <Text style={{
                  color: fx?.stale ? "#E0A44A" : theme.primary,
                  fontSize: 12, fontWeight: "700", marginLeft: 4,
                  textTransform: "uppercase", letterSpacing: 0.5,
                }}>
                  {fx ? `Live: ${fx.rate.toFixed(4)}` : (fxLoading ? "Fetching live rate…" : "Live rate unavailable")}
                </Text>
              </View>
              {fx && (
                <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 2 }}>
                  {fx.stale ? "stale — upstream unreachable · " : ""}
                  as of {new Date(fx.fetched_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                  {"  ·  "}{fx.source}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => loadFx(true)}
              disabled={fxLoading}
              style={{
                paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8,
                borderRadius: 6, borderWidth: 1, borderColor: theme.border,
                opacity: fxLoading ? 0.4 : 1,
              }}
            >
              {fxLoading
                ? <ActivityIndicator size="small" color={theme.primary} />
                : <Ionicons name="refresh" size={14} color={theme.textPrimary} />}
            </TouchableOpacity>
          </View>

          {/* --- Locked at quote-creation chip — audit trail --- */}
          {quote.fx_snapshot?.rate != null && (() => {
            const lockedRate = Number(quote.fx_snapshot.rate);
            const lockedAt = new Date(quote.fx_snapshot.fetched_at);
            const drift = fx?.rate != null ? fx.rate - lockedRate : null;
            const driftPct = drift != null && lockedRate ? (drift / lockedRate) * 100 : null;
            const isSameRate = drift == null || Math.abs(drift) < 0.0001;
            return (
              <View style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                backgroundColor: "#141210", padding: 10, borderRadius: 8, marginBottom: 10,
                borderWidth: 1, borderColor: "#3a2e1e",
              }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="lock-closed-outline" size={13} color="#C9A96E" />
                    <Text style={{
                      color: "#C9A96E", fontSize: 12, fontWeight: "700", marginLeft: 4,
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>
                      Locked at creation: {lockedRate.toFixed(4)}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 2 }}>
                    {lockedAt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    {"  "}
                    {lockedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}
                    {"  ·  "}{quote.fx_snapshot.source}
                  </Text>
                </View>
                {!isSameRate && driftPct != null && (
                  <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
                    <Text style={{
                      color: drift! >= 0 ? "#4CAF50" : "#E06666",
                      fontSize: 11, fontWeight: "700",
                    }}>
                      {drift! >= 0 ? "▲" : "▼"} {Math.abs(driftPct).toFixed(2)}%
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 9 }}>vs today</Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Bank-buffer / adjustment % — allows for daily fluctuations & bank rates */}
          <NumRow
            label="Bank buffer / adjustment" suffix="%"
            value={String(quote.inputs?.fx_adjustment_pct ?? "")}
            onChangeText={setNumeric("fx_adjustment_pct")} onBlur={commitInputs}
            labelColor={SEMANTIC.green}
          />

          {/* Effective (live + buffer) — shows the delta in dollar terms */}
          {fx?.rate != null && effectiveLiveRate != null && (
            <View style={{
              backgroundColor: "#0A0A0A", borderRadius: 6, padding: 8, marginBottom: 10,
              borderLeftWidth: 2, borderLeftColor: theme.primary,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  {fx.rate.toFixed(4)} × (1 + {adjustmentPct.toFixed(2)}%)
                </Text>
                <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "700" }}>
                  = {effectiveLiveRate.toFixed(4)}
                </Text>
              </View>
              {usdSubtotal > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                    Buffer worth on USD {usdSubtotal.toFixed(2)}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                    +AUD {(usdSubtotal * (effectiveLiveRate - fx.rate)).toFixed(2)}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                onPress={applyLiveRate}
                style={{
                  marginTop: 6, alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 5,
                  borderRadius: 5, backgroundColor: theme.primary,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>
                  Apply to rate below →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <NumRow label="USD → AUD rate (effective)" suffix="×"
            value={String(quote.inputs?.usd_to_aud_rate ?? "")}
            onChangeText={setNumeric("usd_to_aud_rate")} onBlur={commitInputs} />

          {/* --- Conversion summary — full breakdown at the bottom --- */}
          {usdSubtotal > 0 && (() => {
            const rate = Number(quote.inputs?.usd_to_aud_rate || 0);
            const aud = usdSubtotal * rate;
            const usdFmt = usdSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const audFmt = aud.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const showOffset = fx?.rate && Math.abs(rate - fx.rate) > 0.0001;
            return (
              <View style={{
                marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border,
              }}>
                <Text style={{ color: theme.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Conversion Summary
                </Text>
                {showOffset ? (
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 2 }}>
                    USD {usdFmt}  ×  {fx!.rate.toFixed(4)} (live)  ×  (1 + {adjustmentPct.toFixed(2)}%)
                  </Text>
                ) : (
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 2 }}>
                    USD {usdFmt}  ×  {rate.toFixed(4)}
                  </Text>
                )}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "600" }}>
                    = Effective rate {rate.toFixed(4)}
                  </Text>
                  <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "800" }}>
                    AUD {audFmt}
                  </Text>
                </View>
              </View>
            );
          })()}
        </Section>

        {/* --- Metal spot rates (locked at quote creation) --- */}
        <Section
          title="Metal Spot Rates (locked)"
          subtitle={
            quote.metal_spot_snapshot?.captured_at
              ? `Snapshot from ${new Date(quote.metal_spot_snapshot.captured_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })} · ${quote.metal_spot_snapshot.source || "spot"}`
              : "Snapshot unavailable — captures on next refresh"
          }
          collapsible
          defaultOpen={false}
        >
          {(() => {
            const snap = quote.metal_spot_snapshot?.usd_per_gram;
            if (!snap) {
              return (
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  No spot-rate snapshot on this quote yet. Reload the page to backfill from today&apos;s rates.
                </Text>
              );
            }
            const rows: { label: string; key: keyof typeof snap; sub: string }[] = [
              { label: "10k gold",       key: "gold_10k",       sub: "41.67% Au" },
              { label: "14k gold",       key: "gold_14k",       sub: "58.33% Au" },
              { label: "18k gold",       key: "gold_18k",       sub: "75.00% Au" },
              { label: "Platinum Pt950", key: "platinum_pt950", sub: "95.00% Pt" },
              { label: "Silver S925",    key: "silver_s925",    sub: "92.50% Ag" },
            ];
            return rows.map((r, idx) => (
              <View key={r.key}
                style={{
                  flexDirection: "row", alignItems: "center",
                  paddingVertical: 6,
                  borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: "#1a1a1a",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "600" }}>{r.label}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }}>{r.sub}</Text>
                </View>
                <Text style={{ color: theme.primary, fontSize: 14, fontWeight: "700" }}>
                  ${Number(snap[r.key]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 10, marginLeft: 4, width: 30 }}>/g</Text>
              </View>
            ));
          })()}
        </Section>

        {/* --- AUD costs --- */}
        <Section title="AUD Costs" subtitle="Ancillary AUD-native fees added after currency conversion">
          {AUD_FIELDS
            .filter(f => f.key !== "custom_clearance_aud")
            .map(f => (
              <NumRow key={f.key} label={f.label} suffix={f.suffix}
                value={String(quote.inputs?.[f.key] ?? "")}
                onChangeText={setNumeric(f.key)} onBlur={commitInputs} />
            ))}

          {/* --- Customs clearance — bulk cost ÷ divisor = per-unit ------
              Same pattern as Air freight: bulk shipment customs cost ÷
              pieces in the shipment = per-unit customs, which flows
              into the compute-consumed ``custom_clearance_aud`` field
              (still admin-editable so single-piece imports work). */}
          {(() => {
            const bulkStr = String(quote.inputs?.custom_clearance_bulk_aud ?? "");
            const divStr = String(quote.inputs?.custom_clearance_divisor ?? "");
            const perStr = String(quote.inputs?.custom_clearance_aud ?? "");
            const recompute = (patch: Record<string, any>) => {
              if (!quote) return;
              const nextInputs = { ...(quote.inputs || {}), ...patch };
              const bulk = Number(nextInputs.custom_clearance_bulk_aud);
              const div  = Number(nextInputs.custom_clearance_divisor);
              // divisor > 0 → per-unit = bulk / divisor.
              // divisor 0 / blank → bulk-split OFF, per-unit = bulk.
              if (Number.isFinite(bulk)) {
                nextInputs.custom_clearance_aud = (Number.isFinite(div) && div > 0)
                  ? Math.round((bulk / div) * 100) / 100
                  : bulk;
              }
              setQuote((q: any) => ({ ...q, inputs: nextInputs }));
              persist({ inputs: nextInputs });
            };
            const cellStyle = {
              flex: 1, minWidth: 0, width: 0,
              borderWidth: 1, borderColor: theme.border, borderRadius: 6,
              paddingHorizontal: 8, paddingVertical: 6,
              color: theme.textPrimary, textAlign: "right" as const, fontSize: 12,
            };
            return (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ color: theme.textPrimary, flex: 1, fontSize: 13 }}>Customs clearance</Text>
                <View style={{ flexDirection: "row", alignItems: "center", width: 100, marginRight: 4 }}>
                  <TextInput
                    value={bulkStr}
                    onChangeText={(v) => setInput("custom_clearance_bulk_aud", v)}
                    onBlur={() => recompute({ custom_clearance_bulk_aud: Number(bulkStr) || 0 })}
                    placeholder="Bulk"
                    placeholderTextColor="#555"
                    keyboardType="decimal-pad"
                    style={cellStyle}
                  />
                </View>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginHorizontal: 2 }}>÷</Text>
                <View style={{ flexDirection: "row", alignItems: "center", width: 60, marginRight: 4 }}>
                  <TextInput
                    value={divStr}
                    onChangeText={(v) => setInput("custom_clearance_divisor", v)}
                    onBlur={() => recompute({ custom_clearance_divisor: Number(divStr) || 0 })}
                    placeholder="qty"
                    placeholderTextColor="#555"
                    keyboardType="decimal-pad"
                    style={cellStyle}
                  />
                </View>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginHorizontal: 2 }}>=</Text>
                <View style={{ flexDirection: "row", alignItems: "center", width: 100 }}>
                  <TextInput
                    value={perStr}
                    onChangeText={(v) => setInput("custom_clearance_aud", v)}
                    onBlur={commitInputs}
                    keyboardType="decimal-pad"
                    style={cellStyle}
                  />
                  <Text style={{ color: theme.textMuted, fontSize: 11, width: 32, textAlign: "right", marginLeft: 4 }}>AUD</Text>
                </View>
              </View>
            );
          })()}
          {/* Two flexible rows: $ vs % of AUD converted total */}
          {(() => {
            const audConvertedTotal = usdSubtotal * Number(quote.inputs?.usd_to_aud_rate || 0);
            return FLEX_FIELDS.map(f => (
              <FlexRow
                key={f.root}
                label={f.label}
                mode={(quote.inputs?.[`${f.root}_mode`] as "amount" | "percent") || "amount"}
                pctValue={String(quote.inputs?.[`${f.root}_pct`] ?? "")}
                amountValue={String(quote.inputs?.[`${f.root}_aud`] ?? "")}
                baseAmount={audConvertedTotal}
                onModeChange={(m) => commitField(`${f.root}_mode`, m)}
                onPctChange={setNumeric(`${f.root}_pct`)}
                onAmountChange={setNumeric(`${f.root}_aud`)}
                onBlur={commitInputs}
                // Both pass-through fees are surfaced green so they read
                // as safe/expected baseline atelier costs.
                labelColor={SEMANTIC.green}
              />
            ));
          })()}
          {/* --- AUD subtotal (client-side, mirrors backend resolve logic).
              Includes the converted USD→AUD amount so the total reflects
              the full landed cost before margin. --- */}
          {(() => {
            const i = quote.inputs || {};
            const audConvertedTotal = usdSubtotal * Number(i.usd_to_aud_rate || 0);
            const resolveFlex = (root: string) =>
              i[`${root}_mode`] === "percent"
                ? audConvertedTotal * (Number(i[`${root}_pct`]) || 0) / 100
                : Number(i[`${root}_aud`]) || 0;
            const audNative =
              (Number(i.custom_clearance_aud) || 0) +
              (Number(i.australian_delivery_aud) || 0) +
              resolveFlex("intl_transaction_fees") +
              resolveFlex("duty_or_chafta");
            const audTotal = audConvertedTotal + audNative;
            const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (
              <View style={{
                marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border,
              }}>
                {/* Breakdown lines */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    Converted from USD (USD {fmt(usdSubtotal)} × {Number(i.usd_to_aud_rate || 0).toFixed(4)})
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    AUD {fmt(audConvertedTotal)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    AUD-native fees (customs + delivery + intl-txn + duty)
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    AUD {fmt(audNative)}
                  </Text>
                </View>
                {/* Grand total */}
                <View style={{
                  flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                  paddingTop: 6, borderTopWidth: 1, borderTopColor: "#1a1a1a",
                }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "700" }}>
                    Total AUD amount
                  </Text>
                  <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "800" }}>
                    AUD {fmt(audTotal)}
                  </Text>
                </View>
              </View>
            );
          })()}
        </Section>

        {/* --- Margin & GST --- */}
        <Section title="Margin & GST">
          {(() => {
            const i = quote.inputs || {};
            const audConvertedTotal = usdSubtotal * Number(i.usd_to_aud_rate || 0);
            const resolveFlex = (root: string) =>
              i[`${root}_mode`] === "percent"
                ? audConvertedTotal * (Number(i[`${root}_pct`]) || 0) / 100
                : Number(i[`${root}_aud`]) || 0;
            const costPriceAud =
              audConvertedTotal
              + (Number(i.custom_clearance_aud) || 0)
              + (Number(i.australian_delivery_aud) || 0)
              + resolveFlex("intl_transaction_fees")
              + resolveFlex("duty_or_chafta");
            const markupAmount =
              i.markup_mode === "amount"
                ? Number(i.markup_amount_aud) || 0
                : costPriceAud * (Number(i.markup_pct) || 0) / 100;
            const exGstTotal = costPriceAud + markupAmount;
            const gstAmount =
              i.gst_mode === "amount"
                ? Number(i.gst_amount_aud) || 0
                : exGstTotal * (Number(i.gst_pct) || 0) / 100;
            const salePriceIncGst = exGstTotal + gstAmount;
            const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (
              <>
                {/* Markup — $/% dual input against Total AUD amount */}
                <FlexRow
                  label="Markup"
                  mode={(i.markup_mode as "amount" | "percent") || "percent"}
                  pctValue={String(i.markup_pct ?? "")}
                  amountValue={String(i.markup_amount_aud ?? "")}
                  baseAmount={costPriceAud}
                  baseLabel="Total AUD amount"
                  onModeChange={(m) => commitField("markup_mode", m)}
                  onPctChange={setNumeric("markup_pct")}
                  onAmountChange={setNumeric("markup_amount_aud")}
                  onBlur={commitInputs}
                  // Yellow = margin lever the admin manually tunes.
                  labelColor={SEMANTIC.yellow}
                />
                {/* Ex-GST subtotal: Total AUD amount + Markup */}
                <View style={{
                  marginTop: 2, marginBottom: 10, paddingTop: 8,
                  borderTopWidth: 1, borderTopColor: theme.border,
                }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                      Total AUD amount + Markup
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                      AUD {fmt(costPriceAud)} + AUD {fmt(markupAmount)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "700" }}>
                      Ex-GST Total cost
                    </Text>
                    <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "800" }}>
                      AUD {fmt(exGstTotal)}
                    </Text>
                  </View>
                </View>
                {/* GST — $/% dual input against Ex-GST total */}
                <FlexRow
                  label="GST"
                  mode={(i.gst_mode as "amount" | "percent") || "percent"}
                  pctValue={String(i.gst_pct ?? "")}
                  amountValue={String(i.gst_amount_aud ?? "")}
                  baseAmount={exGstTotal}
                  baseLabel="Ex-GST Total cost"
                  onModeChange={(m) => commitField("gst_mode", m)}
                  onPctChange={setNumeric("gst_pct")}
                  onAmountChange={setNumeric("gst_amount_aud")}
                  onBlur={commitInputs}
                  // Red = the tax we always collect (10 % baseline).
                  labelColor={SEMANTIC.red}
                />
                {/* Sale Price (inc GST) — grand total for this section */}
                <View style={{
                  marginTop: 2, paddingTop: 8,
                  borderTopWidth: 1, borderTopColor: theme.border,
                }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                      Ex-GST Total + GST
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                      AUD {fmt(exGstTotal)} + AUD {fmt(gstAmount)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: "700" }}>
                      Sale Price (inc GST)
                    </Text>
                    <Text style={{ color: theme.primary, fontSize: 16, fontWeight: "800" }}>
                      AUD {fmt(salePriceIncGst)}
                    </Text>
                  </View>
                </View>
              </>
            );
          })()}
        </Section>

        {/* --- Discount tiers --- */}
        <Section title="Discount Tiers" subtitle="Commission / discount payout matrix">
          {tiers.length === 0 && (
            <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>No tiers configured. Add one to see per-tier sell price and margin left.</Text>
          )}
          {tiers.map((tier: any, i: number) => (
            <View key={i} style={{ marginBottom: 8, borderWidth: 1, borderColor: theme.border, borderRadius: 6, padding: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TextInput
                  value={tier.label ?? ""}
                  onChangeText={(v) => setTierField(i, "label", v)}
                  onBlur={commitInputs}
                  placeholder="Label" placeholderTextColor="#555"
                  style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 6, padding: 6, color: theme.textPrimary, fontSize: 12 }}
                />
                <TextInput
                  value={String(tier.discount_pct ?? "")}
                  onChangeText={(v) => setTierField(i, "discount_pct", v === "" ? 0 : Number(v))}
                  onBlur={commitInputs}
                  keyboardType="decimal-pad"
                  style={{ width: 80, borderWidth: 1, borderColor: theme.border, borderRadius: 6, padding: 6, color: theme.textPrimary, fontSize: 12, textAlign: "right" }}
                />
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>%</Text>
                <TouchableOpacity onPress={() => removeTier(i)}>
                  <Ionicons name="trash-outline" size={16} color="#E06666" />
                </TouchableOpacity>
              </View>
              {tier.sell_ex_gst != null && (
                <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Sell (ex-GST)</Text>
                  <Text style={{ color: theme.textPrimary, fontSize: 11 }}>AUD {Number(tier.sell_ex_gst).toFixed(2)}</Text>
                </View>
              )}
              {tier.margin_left != null && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Margin left</Text>
                  <Text style={{ color: Number(tier.margin_left) < 0 ? "#E06666" : theme.textPrimary, fontSize: 11 }}>AUD {Number(tier.margin_left).toFixed(2)}</Text>
                </View>
              )}
              {tier.payout_figure_usd != null && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>Payout figure</Text>
                  <Text style={{ color: theme.textPrimary, fontSize: 11 }}>USD {Number(tier.payout_figure_usd).toFixed(2)}</Text>
                </View>
              )}
            </View>
          ))}
          <TouchableOpacity onPress={addTier}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 8, borderRadius: 6, borderWidth: 1, borderColor: theme.primary, borderStyle: "dashed" }}>
            <Ionicons name="add" size={14} color={theme.primary} />
            <Text style={{ color: theme.primary, marginLeft: 4, fontSize: 12, fontWeight: "700" }}>Add tier</Text>
          </TouchableOpacity>
        </Section>

        {/* --- Totals --- */}
        <View style={{ backgroundColor: "#0F1F1F", padding: spacing.md, borderRadius: 10, marginTop: spacing.md, borderWidth: 1, borderColor: theme.primary }}>
          <Text style={{ color: theme.primary, fontWeight: "800", fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Totals</Text>
          <TotalRow label="Total USD costs" val={t?.total_usd_costs} unit="USD" />
          <TotalRow label="Total cost in AUD (FX)" val={t?.total_cost_aud} unit="AUD" />
          <TotalRow label="Cost price (AUD)" val={t?.cost_price_aud} unit="AUD" />
          <TotalRow label="Markup amount" val={t?.markup_amount_aud} unit="AUD" />
          <TotalRow label="Retail sell (ex-GST)" val={t?.retail_sell_price_ex_gst_aud} unit="AUD" />
          <TotalRow label="GST amount" val={t?.gst_amount_aud} unit="AUD" />
          <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 6 }} />
          <TotalRow label="Total sell price (inc-GST)" val={t?.total_sell_price_inc_gst_aud} unit="AUD" big />
          <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 6 }} />
          <TotalRow label="Gross profit margin" val={t?.gross_profit_margin_aud} unit="AUD" />
          <TotalRow label="Gross profit margin %" val={t?.gross_profit_margin_pct} unit="%" />
          {/* --- AUD ex-GST → USD cost multiple ------------------------
              Ratio of AUD retail sell (ex-GST) over raw USD costs.
              A higher multiple means the AUD retail is well above the
              USD cost — i.e. a healthy uplift ("5× on cost"). */}
          {(() => {
            const usd = Number(t?.total_usd_costs) || 0;
            const audExGst = Number(t?.retail_sell_price_ex_gst_aud) || 0;
            if (usd <= 0 || audExGst <= 0) return null;
            const multiple = audExGst / usd;
            return (
              <View style={{
                flexDirection: "row", justifyContent: "space-between",
                alignItems: "center", marginTop: 4,
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700" }}>
                    AUD ex-GST ÷ USD cost
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                    AUD {audExGst.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    {" ÷ "}
                    USD {usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </Text>
                </View>
                <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "800" }}>
                  {multiple.toFixed(2)}×
                </Text>
              </View>
            );
          })()}
        </View>

        {/* --- Distribution — splits the gross profit margin --- */}
        {(() => {
          const margin = Number(t?.gross_profit_margin_aud) || 0;
          const rows = [
            { key: "distribution_somnio_pct",           label: "Somnio",           def: 45 },
            { key: "distribution_associate_pct",        label: "Associate",        def: 45 },
            { key: "distribution_adv_marketing_pct",    label: "Adv / Marketing",  def: 5 },
            { key: "distribution_tech_maintenance_pct", label: "Tech Maintenance", def: 5 },
          ];
          // Use ?? fallback to show defaults on legacy quotes — the
          // server will hydrate the fields on the next PATCH round-trip.
          const values = rows.map(r => Number(quote.inputs?.[r.key] ?? r.def));
          const totalPct = values.reduce((a, b) => a + b, 0);
          const totalAud = margin * (totalPct / 100);
          const isBalanced = Math.abs(totalPct - 100) < 0.01;
          const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return (
            <Section
              title="Distribution"
              subtitle={`Splits the gross profit margin (AUD ${fmt(margin)}) between commercial partners`}
            >
              {rows.map((r, idx) => {
                const pct = values[idx];
                const aud = margin * (pct / 100);
                const shown = quote.inputs?.[r.key] ?? r.def;
                return (
                  <View key={r.key}
                    style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
                  >
                    <Text style={{ color: theme.textPrimary, flex: 1, fontSize: 13 }}>{r.label}</Text>
                    {/* Editable % */}
                    <View style={{ flexDirection: "row", alignItems: "center", width: 100, marginRight: 12 }}>
                      <TextInput
                        value={String(shown)}
                        onChangeText={setNumeric(r.key)}
                        onBlur={commitInputs}
                        keyboardType="decimal-pad"
                        style={{
                          flex: 1, minWidth: 0, width: 0,
                          borderWidth: 1, borderColor: theme.border, borderRadius: 6,
                          paddingHorizontal: 8, paddingVertical: 6, color: theme.textPrimary,
                          textAlign: "right",
                        }}
                      />
                      <Text style={{ color: theme.textMuted, fontSize: 11, width: 20, textAlign: "right", marginLeft: 4 }}>%</Text>
                    </View>
                    {/* Derived $ */}
                    <View style={{ width: 140, alignItems: "flex-end" }}>
                      <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "700" }}>
                        AUD {fmt(aud)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {/* Total row — warns if % != 100 */}
              <View style={{
                flexDirection: "row", alignItems: "center",
                marginTop: 6, paddingTop: 8,
                borderTopWidth: 1, borderTopColor: theme.border,
              }}>
                <Text style={{
                  color: isBalanced ? theme.textPrimary : "#E06666",
                  flex: 1, fontSize: 13, fontWeight: "700",
                }}>
                  Total {isBalanced ? "" : "⚠ should be 100%"}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", width: 100, marginRight: 12, justifyContent: "flex-end" }}>
                  <Text style={{
                    color: isBalanced ? theme.primary : "#E06666",
                    fontSize: 14, fontWeight: "800",
                  }}>
                    {totalPct.toFixed(2)}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11, width: 20, textAlign: "right", marginLeft: 4 }}>%</Text>
                </View>
                <View style={{ width: 140, alignItems: "flex-end" }}>
                  <Text style={{
                    color: isBalanced ? theme.primary : "#E06666",
                    fontSize: 14, fontWeight: "800",
                  }}>
                    AUD {fmt(totalAud)}
                  </Text>
                </View>
              </View>
            </Section>
          );
        })()}

        {/* --- Market Anchor — competitor price comparison --- */}
        <MarketAnchorSection quoteId={qid} />

        <Text style={{ color: theme.textMuted, fontSize: 10, textAlign: "center", marginTop: 12 }}>
          Totals recompute live from your inputs. Persisted on blur.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
