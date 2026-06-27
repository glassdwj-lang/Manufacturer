/**
 * Admin · Cross-Order CAD Library
 *
 * Primary filter: workshop (manufacturer).
 * Secondary filter: client.
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "cad-library",
  kind: "cad",
  icon: "cube-outline",
  primary: {
    role: "manufacturer",
    placeholderKey: "lib.all_workshops",
    icon: "business-outline",
  },
  secondary: {
    role: "client",
    placeholderKey: "lib.all_clients",
    icon: "person-outline",
  },
  copy: {
    eyebrow: "cad_lib.eyebrow",
    title: "cad_lib.title",
    searchPlaceholder: "cad_lib.search_placeholder",
    empty: "cad_lib.empty",
    emptyHint: "cad_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "cad_lib.email_cta",
    emailCtaPlural: "cad_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: ({ primaryId, secondaryId, q, date_from, date_to }) =>
    api.adminListAllCadFiles({
      manufacturer_id: primaryId,
      client_id: secondaryId,
      q,
      date_from,
      date_to,
    }),
  sendEmail: (payload) => api.adminEmailCrossOrderCadFiles(payload),
};

export default function CadLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
