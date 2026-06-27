/**
 * Admin · Cross-Order IGI Certificates Library
 *
 * Lists every approved IGI certificate across every commission. Thin
 * wrapper around the shared `CrossOrderLibrary` shell.
 */
import React from "react";
import { api } from "@/src/api/client";
import { CrossOrderLibrary, LibraryConfig } from "@/src/screens/admin-library/CrossOrderLibrary";

const config: LibraryConfig = {
  slug: "igi-library",
  kind: "igi",
  icon: "ribbon-outline",
  chipRole: "manufacturer",
  copy: {
    eyebrow: "igi_lib.eyebrow",
    title: "igi_lib.title",
    allChip: "cad_lib.all_workshops",
    searchPlaceholder: "igi_lib.search_placeholder",
    empty: "igi_lib.empty",
    emptyHint: "igi_lib.empty_hint",
    selected: "cad_lib.selected",
    clearSelection: "cad_lib.clear_selection",
    emailCta: "igi_lib.email_cta",
    emailCtaPlural: "igi_lib.email_cta_plural",
    open: "cad_lib.open",
  },
  fetchRows: ({ chipId, q }) =>
    api.adminListAllIgiCertificates({ manufacturer_id: chipId, q }),
  sendEmail: (payload) => api.adminEmailCrossOrderIgi(payload),
};

export default function IgiLibraryScreen() {
  return <CrossOrderLibrary config={config} />;
}
