/**
 * Admin · Cross-Order CAD Library
 *
 * Was previously a ~620-line bespoke implementation. Refactored onto the
 * shared `CrossOrderLibrary` shell along with the IGI/Airway/Customs
 * libraries. Behaviour preserved: workshop chip filter, debounced search,
 * grouped list per commission, multi-select + bulk email via
 * `EmailFilesModal`.
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "cad-library",
  kind: "cad",
  icon: "cube-outline",
  chipRole: "manufacturer",
  copy: {
    eyebrow: "cad_lib.eyebrow",
    title: "cad_lib.title",
    allChip: "cad_lib.all_workshops",
    searchPlaceholder: "cad_lib.search_placeholder",
    empty: "cad_lib.empty",
    emptyHint: "cad_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "cad_lib.email_cta",
    emailCtaPlural: "cad_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: ({ chipId, q }) =>
    api.adminListAllCadFiles({ manufacturer_id: chipId, q }),
  sendEmail: (payload) => api.adminEmailCrossOrderCadFiles(payload),
};

export default function CadLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
