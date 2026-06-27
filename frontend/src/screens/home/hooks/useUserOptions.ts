/**
 * useUserOptions — fetches & sorts the client / workshop / associate
 * lists used by the home filter panel pickers. Loaded once when filter
 * UI is enabled (admin/associate roles).
 */
import { useEffect, useState } from "react";
import { api, User } from "@/src/api/client";

export function useUserOptions(enabled: boolean) {
  const [clientOptions, setClientOptions] = useState<User[]>([]);
  const [mfgOptions, setMfgOptions] = useState<User[]>([]);
  const [assocOptions, setAssocOptions] = useState<User[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await api.listUsers();
        if (cancelled) return;
        const clients = all.filter((u) => u.role === "client");
        const mfgs = all.filter((u) => u.role === "manufacturer");
        const assoc = all.filter((u) => u.role === "associate");
        setClientOptions(
          clients.sort((a, b) =>
            (a.name || "").localeCompare(b.name || ""),
          ),
        );
        setMfgOptions(
          mfgs.sort((a, b) =>
            (a.alias || a.name || "").localeCompare(b.alias || b.name || ""),
          ),
        );
        setAssocOptions(
          assoc.sort((a, b) =>
            (a.name || "").localeCompare(b.name || ""),
          ),
        );
      } catch (e) {
        if (!cancelled) console.warn("filter lookup load", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { clientOptions, mfgOptions, assocOptions };
}
