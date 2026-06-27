/**
 * Admin · Cross-Order Airway Bill Library
 * ---------------------------------------
 * Lists every airway-bill document across every commission. Same pattern
 * as CAD/Renders/IGI — mirrors the unified library shell.
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "airway-library",
  kind: "airway_bill",
  icon: "airplane-outline",
  copy: {
    eyebrow: "airway_lib.eyebrow",
    title: "airway_lib.title",
    allWorkshops: "cad_lib.all_workshops",
    searchPlaceholder: "airway_lib.search_placeholder",
    empty: "airway_lib.empty",
    emptyHint: "airway_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "airway_lib.email_cta",
    emailCtaPlural: "airway_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: (params) => api.adminListAllAirwayBillFiles(params),
  sendEmail: (payload) => api.adminEmailCrossOrderAirwayBills(payload),
};

export default function AirwayLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
