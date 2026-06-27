/** Dashboard data shape returned by `/api/admin/dashboard`. */
export type DashboardData = {
  commissions: {
    total: number;
    active: number;
    completed: number;
    by_phase: Record<string, number>;
  };
  top_manufacturers: {
    id: string;
    name: string;
    alias: string;
    email: string;
    active_count: number;
  }[];
  recent_activity: {
    id: string;
    at: string;
    actor_email: string;
    action: string;
  }[];
  approvals_pending: number;
  missing_contacts: number;
  workshops_total: number;
  new_users: Record<string, number>;
  sync_status: { associate_sync: any; gem_gallery_meta: any };
  range?: {
    active: boolean;
    date_from: string | null;
    date_to: string | null;
  };
  generated_at: string;
};
