/**
 * Admin · Cross-Order Customs Library
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "customs-library",
  kind: "customs",
  icon: "document-text-outline",
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
    eyebrow: "customs_lib.eyebrow",
    title: "customs_lib.title",
    searchPlaceholder: "customs_lib.search_placeholder",
    empty: "customs_lib.empty",
    emptyHint: "customs_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "customs_lib.email_cta",
    emailCtaPlural: "customs_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: ({ primaryId, secondaryId, q, date_from, date_to }) =>
    api.adminListAllCustomsFiles({
      manufacturer_id: primaryId,
      client_id: secondaryId,
      q,
      date_from,
      date_to,
    }),
  sendEmail: (payload) => api.adminEmailCrossOrderCustoms(payload),
};

export default function CustomsLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
