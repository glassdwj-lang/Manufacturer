/**
 * Admin · Cross-Order IGI Certificates Library
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "igi-library",
  kind: "igi",
  icon: "ribbon-outline",
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
    eyebrow: "igi_lib.eyebrow",
    title: "igi_lib.title",
    searchPlaceholder: "igi_lib.search_placeholder",
    empty: "igi_lib.empty",
    emptyHint: "igi_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "igi_lib.email_cta",
    emailCtaPlural: "igi_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: ({ primaryId, secondaryId, q, date_from, date_to }) =>
    api.adminListAllIgiCertificates({
      manufacturer_id: primaryId,
      client_id: secondaryId,
      q,
      date_from,
      date_to,
    }),
  sendEmail: (payload) => api.adminEmailCrossOrderIgi(payload),
};

export default function IgiLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
