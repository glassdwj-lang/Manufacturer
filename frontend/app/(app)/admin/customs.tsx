/**
 * Admin · Cross-Order Customs Library
 * -----------------------------------
 * Lists every customs document across every commission. Mirrors the
 * CAD/Renders/IGI/Airway library shell.
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "customs-library",
  kind: "customs",
  icon: "document-text-outline",
  copy: {
    eyebrow: "customs_lib.eyebrow",
    title: "customs_lib.title",
    allWorkshops: "cad_lib.all_workshops",
    searchPlaceholder: "customs_lib.search_placeholder",
    empty: "customs_lib.empty",
    emptyHint: "customs_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "customs_lib.email_cta",
    emailCtaPlural: "customs_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: (params) => api.adminListAllCustomsFiles(params),
  sendEmail: (payload) => api.adminEmailCrossOrderCustoms(payload),
};

export default function CustomsLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
