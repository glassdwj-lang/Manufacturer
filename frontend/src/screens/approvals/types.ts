import type { ModerationKind, ModerationTarget } from "@/src/components/MediaModerationModal";

/** A single moderation row, returned by `/api/photos/pending` or `/api/photos/recycled`. */
export type QueueItem = {
  order_id: string;
  order_ref: string;
  client_name: string;
  jewelry_name: string;
  manufacturer_alias?: string;
  manufacturer_email?: string;
  manufacturer_name?: string;
  step_number: number;
  step_title: string;
  step_phase: string;
  photo_url: string;
  status?: "pending" | "on_hold";
  rejected_by?: string;
  rejected_at?: string;
  days_remaining?: number | null;
};

/** Which sub-list is visible in the screen. */
export type ApprovalsTab = "pending" | "on_hold" | "recycled";

/** Open moderation modal payload. */
export type ModerationState = {
  kind: ModerationKind;
  target: ModerationTarget;
};
