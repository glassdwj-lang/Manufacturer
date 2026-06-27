/**
 * useCommissionFilters — owns the draft/applied filter state machine for
 * the home screen.
 *
 *   - `applied` is the source of truth (drives API + URL + chip strip).
 *   - `draft` mirrors the form fields inside the expandable panel.
 *   - `applyDraft()` commits draft → applied (GO button).
 *   - `cancelDraft()` discards form edits and resets to applied.
 *   - `clearOne(key)` / `clearAll()` are wired into the chip strip.
 *
 * URL sync is one-way (applied → URL params) so refresh restores the
 * same view and the URL becomes a shareable bookmark.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppliedFilters, EMPTY_FILTERS, FilterKey } from "../types";
import type { FilterDraft } from "../components/CommissionFilterPanel";

export function useCommissionFilters(enabled: boolean) {
  const router = useRouter();
  const urlParams = useLocalSearchParams<{
    client?: string;
    mfg?: string;
    assoc?: string;
    q?: string;
    from?: string;
    to?: string;
  }>();

  // Seed both states from URL on first render.
  const seed: AppliedFilters = {
    client: typeof urlParams.client === "string" ? urlParams.client : "",
    mfg: typeof urlParams.mfg === "string" ? urlParams.mfg : "",
    assoc: typeof urlParams.assoc === "string" ? urlParams.assoc : "",
    q: typeof urlParams.q === "string" ? urlParams.q : "",
    from: typeof urlParams.from === "string" ? urlParams.from : "",
    to: typeof urlParams.to === "string" ? urlParams.to : "",
  };

  const [applied, setApplied] = useState<AppliedFilters>(seed);
  const [draft, setDraft] = useState<FilterDraft>(seed);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeCount = useMemo(() => {
    let n = 0;
    if (applied.client) n += 1;
    if (applied.mfg) n += 1;
    if (applied.assoc) n += 1;
    if (applied.q) n += 1;
    if (applied.from) n += 1;
    if (applied.to) n += 1;
    return n;
  }, [applied]);

  const draftHasChanges = useMemo(() => {
    return (
      draft.client !== applied.client ||
      draft.mfg !== applied.mfg ||
      draft.assoc !== applied.assoc ||
      draft.q.trim() !== applied.q ||
      draft.from !== applied.from ||
      draft.to !== applied.to
    );
  }, [draft, applied]);

  const applyDraft = useCallback(() => {
    setApplied({
      client: draft.client,
      mfg: draft.mfg,
      assoc: draft.assoc,
      q: draft.q.trim(),
      from: draft.from,
      to: draft.to,
    });
    setFiltersOpen(false);
  }, [draft]);

  const cancelDraft = useCallback(() => {
    setDraft(applied);
    setFiltersOpen(false);
  }, [applied]);

  const clearAll = useCallback(() => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  }, []);

  const clearOne = useCallback((key: FilterKey) => {
    setDraft((d) => ({ ...d, [key]: "" }));
    setApplied((p) => ({ ...p, [key]: "" }));
  }, []);

  // Mirror applied filters into the URL.
  useEffect(() => {
    if (!enabled) return;
    const params: Record<string, string> = {};
    if (applied.client) params.client = applied.client;
    if (applied.mfg) params.mfg = applied.mfg;
    if (applied.assoc) params.assoc = applied.assoc;
    if (applied.q) params.q = applied.q;
    if (applied.from) params.from = applied.from;
    if (applied.to) params.to = applied.to;
    try {
      router.setParams(params as any);
    } catch {
      /* setParams isn't critical for functionality */
    }
  }, [enabled, applied, router]);

  return {
    applied,
    draft,
    setDraft,
    filtersOpen,
    setFiltersOpen,
    activeCount,
    draftHasChanges,
    applyDraft,
    cancelDraft,
    clearAll,
    clearOne,
  };
}
