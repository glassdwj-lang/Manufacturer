/**
 * Local types for the create / edit user module.
 *
 * `Country` mirrors the server's ``/countries`` endpoint payload, including
 * the optional `states` list for countries that have a fixed admin
 * subdivision (AU, US, CN, etc.).
 */
import type { ManufacturerContact, Role } from "@/src/api/client";

export type StateEntry = { code: string; name: string };

export type Country = {
  code: string;
  name: string;
  language: string;
  language_name: string;
  dial_code?: string;
  state_label?: string;
  phone_format?: string;
  states?: StateEntry[];
};

/** Fallback dial codes for the rare case a country slips into the dropdown
 *  without ``dial_code`` from the server. The server is the source of truth. */
export const DIAL_CODE_FALLBACK: Record<string, string> = {
  AU: "+61", CN: "+86", FR: "+33", IT: "+39", JP: "+81", KR: "+82",
  GB: "+44", US: "+1", CA: "+1", DE: "+49", ES: "+34", CH: "+41",
  SG: "+65", HK: "+852", AE: "+971", NZ: "+64", IN: "+91",
};

export const ROLE_OPTIONS: Role[] = ["manufacturer", "cad_renderer", "client"];

/** Factory for a blank manufacturer/cad_renderer contact roster slot.
 *  The `tmp-…` id is stripped before sending to the server. */
export function emptyContact(): ManufacturerContact {
  return {
    id: `tmp-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    company_title: "",
    country: "",
    mobile_number: "",
    whatsapp_number: "",
    wechat_id: "",
    other_label: "",
    other_value: "",
    email: "",
  };
}
