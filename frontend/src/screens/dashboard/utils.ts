/** Date/time helpers used across the dashboard cards. */
import type { DateRangeValue } from "@/src/screens/admin-library/DateRangePresets";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "1d ago" / "3h ago" / "7m ago" / "42s ago". */
export function relTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return iso;
  }
}

/** Build a human caption for the active date filter — mirrors the
 *  format used in the library cross-order views. */
export function rangeCaptionFor(dr: DateRangeValue): string {
  const fmt = (s: string | undefined) => {
    if (!s) return "";
    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return s;
    return `${d} ${MONTHS[m - 1]} ${y}`;
  };
  if (dr.date_from && dr.date_to) return `${fmt(dr.date_from)} → ${fmt(dr.date_to)}`;
  if (dr.date_from) return `from ${fmt(dr.date_from)}`;
  if (dr.date_to) return `until ${fmt(dr.date_to)}`;
  return "";
}
