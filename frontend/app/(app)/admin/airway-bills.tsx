/**
 * Admin · Cross-Order Airway Bill Library
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "airway-library",
  kind: "airway_bill",
  icon: "airplane-outline",
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
    eyebrow: "airway_lib.eyebrow",
    title: "airway_lib.title",
    searchPlaceholder: "airway_lib.search_placeholder",
    empty: "airway_lib.empty",
    emptyHint: "airway_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "airway_lib.email_cta",
    emailCtaPlural: "airway_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: ({ primaryId, secondaryId, q, date_from, date_to }) =>
    api.adminListAllAirwayBillFiles({
      manufacturer_id: primaryId,
      client_id: secondaryId,
      q,
      date_from,
      date_to,
    }),
  sendEmail: (payload) => api.adminEmailCrossOrderAirwayBills(payload),
};

export default function AirwayLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
