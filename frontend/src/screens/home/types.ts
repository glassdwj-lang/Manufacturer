/**
 * Local types for the Home screen module.
 *
 * Kept here (vs the generic api/client.ts types) because they describe
 * the *applied* filter state — i.e. what the home page commits to the
 * URL and uses to query the API.
 */
export type AppliedFilters = {
  client: string;
  mfg: string;
  assoc: string;
  q: string;
  from: string;
  to: string;
};

export type FilterKey = keyof AppliedFilters;

export const EMPTY_FILTERS: AppliedFilters = {
  client: "",
  mfg: "",
  assoc: "",
  q: "",
  from: "",
  to: "",
};
