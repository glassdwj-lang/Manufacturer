// Phone number helpers backed by libphonenumber-js (the same library used by
// gem-gallery-193 — guarantees that numbers entered here look identical to
// numbers entered there).
//
// Usage:
//   const r = formatAsYouType("0412345", "AU"); // "+61 412 345"
//   isValidNumber(r, "AU") -> false (not enough digits yet)
//
// We never store the dial code separately from the local number; the input
// always displays the full international form (e.g. "+61 412 345 678"). On
// submit we strip back to digits-with-leading-+ for storage if needed.

import {
  AsYouType,
  type CountryCode,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from "libphonenumber-js";

/** Returns the +<digits> dial code for an ISO-2 country, or "" if unknown. */
export function dialCodeFor(country: string | undefined | null): string {
  if (!country) return "";
  try {
    return "+" + getCountryCallingCode(country.toUpperCase() as CountryCode);
  } catch {
    return "";
  }
}

/** Real-time formatter for a phone input. Always returns the fully
 * formatted international string (without trailing whitespace). */
export function formatAsYouType(input: string, country: string | undefined | null): string {
  if (!input) return "";
  const cc = (country || "").toUpperCase() as CountryCode | "";
  // Sanitize: strip any character libphonenumber would choke on.
  const cleaned = input.replace(/[^\d+\s\-().]/g, "");
  try {
    if (cc) {
      const t = new AsYouType(cc);
      return t.input(cleaned);
    }
  } catch {
    /* fallthrough */
  }
  return cleaned;
}

/** Returns ``true`` if the supplied value is a valid phone for the country. */
export function isValidNumber(input: string, country: string | undefined | null): boolean {
  if (!input) return false;
  const cc = (country || "").toUpperCase();
  try {
    return isValidPhoneNumber(input, cc as CountryCode);
  } catch {
    return false;
  }
}

/** Returns the canonical E.164 form ("+614…") suitable for storage, or "". */
export function toE164(input: string, country: string | undefined | null): string {
  if (!input) return "";
  const cc = (country || "").toUpperCase() as CountryCode;
  try {
    const parsed = parsePhoneNumberFromString(input, cc);
    if (parsed && parsed.isValid()) return parsed.number;
  } catch {
    /* fallthrough */
  }
  return input;
}

/** Returns the human-friendly national format for a stored value. */
export function formatStored(stored: string, country: string | undefined | null): string {
  if (!stored) return "";
  return formatAsYouType(stored, country);
}
