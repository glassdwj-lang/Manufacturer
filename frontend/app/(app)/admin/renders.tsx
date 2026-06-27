/**
 * Admin · Cross-Order Renders Library
 *
 * Primary filter: CAD/render studio (cad_renderer role).
 * Secondary filter: workshop (manufacturer) for cross-axis filtering.
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "renders-library",
  kind: "cad",
  icon: "images-outline",
  primary: {
    role: "cad_renderer",
    placeholderKey: "lib.all_studios",
    icon: "images-outline",
  },
  secondary: {
    role: "manufacturer",
    placeholderKey: "lib.all_workshops",
    icon: "business-outline",
  },
  copy: {
    eyebrow: "renders_lib.eyebrow",
    title: "renders_lib.title",
    searchPlaceholder: "renders_lib.search_placeholder",
    empty: "renders_lib.empty",
    emptyHint: "renders_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "renders_lib.email_cta",
    emailCtaPlural: "renders_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: ({ primaryId, secondaryId, q, date_from, date_to }) =>
    api.adminListAllRenders({
      cad_renderer_id: primaryId,
      manufacturer_id: secondaryId,
      q,
      date_from,
      date_to,
    }),
  sendEmail: (payload) => api.adminEmailCrossOrderRenders(payload),
};

export default function RendersLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
