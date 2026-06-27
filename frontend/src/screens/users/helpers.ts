/**
 * Role filter chip metadata + helper for the "missing contacts" gate.
 */
import type { User } from "@/src/api/client";

export const ROLE_FILTERS: { key: string; labelKey: string }[] = [
  { key: "manufacturer", labelKey: "users.tab.workshops" },
  { key: "cad_renderer", labelKey: "users.tab.cad_renders" },
  { key: "associate", labelKey: "users.tab.associates" },
  { key: "client", labelKey: "users.tab.clients" },
  { key: "admin", labelKey: "users.tab.atelier" },
];

/** A manufacturer or CAD/Render vendor is "missing contacts" when no
 *  slot in their 3-row roster has a name filled in. Empty rosters are
 *  auto-seeded server-side, so freshly-created workshops also surface
 *  in the missing list — which is exactly what we want. */
export function isMissingContacts(u: User): boolean {
  if (u.role !== "manufacturer" && u.role !== "cad_renderer") return false;
  const list = (u as any).contacts as { name?: string | null }[] | undefined;
  if (!list || list.length === 0) return true;
  return !list.some((c) => (c.name || "").trim().length > 0);
}
