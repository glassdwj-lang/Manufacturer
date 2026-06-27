/**
 * Admin · Cross-Order Renders Library
 *
 * Was previously a ~620-line bespoke implementation. Refactored onto the
 * shared `CrossOrderLibrary` shell. The one twist vs CAD/IGI/Airway/
 * Customs is that the chip rail filters by `cad_renderer` role (the
 * external render studios), not by manufacturer workshops.
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "renders-library",
  kind: "cad",
  icon: "images-outline",
  chipRole: "cad_renderer",
  copy: {
    eyebrow: "renders_lib.eyebrow",
    title: "renders_lib.title",
    allChip: "renders_lib.all_studios",
    searchPlaceholder: "renders_lib.search_placeholder",
    empty: "renders_lib.empty",
    emptyHint: "renders_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "renders_lib.email_cta",
    emailCtaPlural: "renders_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: ({ chipId, q }) =>
    api.adminListAllRenders({ cad_renderer_id: chipId, q }),
  sendEmail: (payload) => api.adminEmailCrossOrderRenders(payload),
};

export default function RendersLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
