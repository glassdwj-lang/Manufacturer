// API client for Somnio.Co Atelier backend.
import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "somnio_token";

export type Role = "admin" | "manufacturer" | "associate" | "client" | "cad_renderer";

export type User = {
  id: string;
  email: string;
  name: string;
  alias?: string;
  role: Role;
  associate_id?: string | null;
  auto_forward?: boolean;
  source?: string;
  country?: string;
  language?: string;
  language_name?: string;
  preferred_language?: string | null;
};

export type Step = {
  step_number: number;
  title: string;
  description?: string;
  phase: string;
  phase_title?: string;
  completed: boolean;
  completed_at_china: string | null;
  completed_at_utc: string | null;
  notes: string;
  notes_translated?: string;
  notes_target_lang?: string;
  photos: string[];
  /** Manufacturer uploads pending admin approval. Visible to admin /
   *  associate / manufacturer but stripped from client responses. */
  pending_photos?: string[];
  /** Photos placed on hold by a moderator — uploader sees them so they
   *  understand the upload landed but needs a re-shoot. */
  on_hold_photos?: string[];
  /** Photos hard-rejected by a moderator (frontend usually hides these
   *  but the field is exposed for completeness). */
  rejected_photos?: string[];
  forwarded_to_client: boolean;
  forwarded_at: string | null;
  associate_review_note?: string;
  associate_review_note_translated?: string;
};

export type Order = {
  id: string;
  order_ref: string;
  client_id: string;
  client_name: string;
  manufacturer_id: string;
  manufacturer_name: string;
  manufacturer_alias?: string;
  associate_id: string | null;
  jewelry_name: string;
  sku: string;
  description: string;
  status: string;
  created_at: string;
  created_at_china: string;
  steps: Step[];
  customs?: any;
  cad_files?: CadFile[];
  igi_certificates?: CadFile[];
  progress?: { completed_count: number; total: number; current_step: number | null };
};

export type RecycledOrder = Order & {
  deleted_at: string;
  deleted_at_china: string;
  deleted_by: string;
};

async function getToken(): Promise<string | null> {
  return await storage.getItem<string>(TOKEN_KEY, "");
}

export async function setToken(token: string) {
  await storage.setItem(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/api${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = "Request failed";
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {}
    // Attach the HTTP status to the thrown error so callers can branch on
    // 401 vs 403 without resorting to message-string sniffing.
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export type ManufacturerContact = {
  id?: string;
  name?: string | null;
  company_title?: string | null;
  country?: string | null;
  mobile_number?: string | null;
  whatsapp_number?: string | null;
  wechat_id?: string | null;
  other_label?: string | null;
  other_value?: string | null;
  email?: string | null;
};

export type CadFile = {
  id: string;
  name: string;
  secure_url: string;
  public_id?: string | null;
  format?: string | null;
  bytes?: number | null;
  resource_type?: string | null;
  uploaded_at?: string | null;
  uploaded_by?: string | null;
  uploaded_by_email?: string | null;
};

export type CadFilePayload = {
  name: string;
  secure_url: string;
  public_id?: string | null;
  format?: string | null;
  bytes?: number | null;
  resource_type?: string | null;
};

export type CustomsFile = CadFile;

export type CustomsKind = "airway-bill" | "customs";

export type CustomsBlob = {
  airway_bill_text?: string | null;
  airway_bill_files?: CustomsFile[];
  customs_files?: CustomsFile[];
  notes?: string | null;
  airway_bill?: string | null;
  customs_document?: string | null;
  updated_at_china?: string | null;
};

// ---- Cross-order document library shared types ---------------------------
// Used by `adminListAllIgiCertificates`, `adminListAllAirwayBillFiles`, and
// `adminListAllCustomsFiles`. All three return the same shape: a CAD-style
// file dict enriched with the parent commission context.
export type DocLibraryRow = CadFile & {
  order_id: string;
  order_ref: string | null;
  jewelry_name: string | null;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  manufacturer_alias: string | null;
  client_id: string | null;
  client_name: string | null;
};

export type DocLibraryEmailPayload = {
  recipients: string[];
  items: { order_id: string; file_id: string }[];
  subject?: string | null;
  message?: string | null;
};

export type DocLibraryEmailResponse = {
  ok: boolean;
  recipients: string[];
  file_count: number;
  order_count: number;
  provider_id: string | null;
};

export const api = {
  seed: () => request<any>("/seed", { method: "POST" }),
  seedExtended: () => request<any>("/seed-extended", { method: "POST" }),
  wipeDemo: () => request<any>("/admin/wipe-demo", { method: "POST" }),
  importAssociates: () => request<any>("/admin/import-associates", { method: "POST" }),
  importAssociatesStatus: () => request<any>("/admin/import-associates/status"),
  syncGemGalleryMeta: () =>
    request<any>("/admin/sync-gem-gallery-meta", { method: "POST" }),
  syncGemGalleryMetaStatus: () =>
    request<any>("/admin/sync-gem-gallery-meta/status"),
  activityLog: (
    params: { limit?: number; offset?: number; action?: string; actor_email?: string } = {},
  ) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    if (params.action) q.set("action", params.action);
    if (params.actor_email) q.set("actor_email", params.actor_email);
    const qs = q.toString();
    return request<{ rows: any[]; total: number; limit: number; offset: number }>(
      `/admin/activity-log${qs ? `?${qs}` : ""}`,
    );
  },
  activityLogActions: () =>
    request<{ actions: string[] }>("/admin/activity-log/actions"),
  getDashboard: (
    params: { date_from?: string; date_to?: string } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    const tail = qs.toString();
    return request<any>(`/admin/dashboard${tail ? `?${tail}` : ""}`);
  },
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/auth/me"),
  listOrders: (
    params: {
      client_id?: string;
      manufacturer_id?: string;
      associate_id?: string;
      q?: string;
      date_from?: string;
      date_to?: string;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.client_id) qs.set("client_id", params.client_id);
    if (params.manufacturer_id) qs.set("manufacturer_id", params.manufacturer_id);
    if (params.associate_id) qs.set("associate_id", params.associate_id);
    if (params.q) qs.set("q", params.q);
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    const tail = qs.toString();
    return request<Order[]>(`/orders${tail ? `?${tail}` : ""}`);
  },
  getOrder: (id: string) => request<Order>(`/orders/${id}`),
  createOrder: (payload: any) =>
    request<Order>("/orders", { method: "POST", body: JSON.stringify(payload) }),
  completeStep: (orderId: string, stepNumber: number, notes: string, photos: string[]) =>
    request<Order>(`/orders/${orderId}/steps/${stepNumber}/complete`, {
      method: "POST",
      body: JSON.stringify({ notes, photos }),
    }),
  updateStep: (
    orderId: string,
    stepNumber: number,
    notes: string,
    photos: string[]
  ) =>
    request<Order>(`/orders/${orderId}/steps/${stepNumber}/update`, {
      method: "POST",
      body: JSON.stringify({ notes, photos }),
    }),
  reopenStep: (orderId: string, stepNumber: number) =>
    request<Order>(`/orders/${orderId}/steps/${stepNumber}/reopen`, {
      method: "POST",
    }),
  // ---- Cloudinary photo uploads ----
  signCloudinaryUpload: (body: { folder?: string; public_id?: string; tags?: string }) =>
    request<any>("/uploads/sign", { method: "POST", body: JSON.stringify(body || {}) }),
  uploadBase64: (body: { base64_data: string; folder?: string; public_id?: string }) =>
    request<{ secure_url: string }>("/uploads/base64", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  migratePhotos: (limit = 0) =>
    request<any>(`/admin/photos/migrate${limit ? `?limit=${limit}` : ""}`, { method: "POST" }),
  // ---- Photo approval queue ----
  listPendingPhotos: () => request<any>(`/photos/pending`, { method: "GET" }),
  // Aggregated pending count across photos / on-hold / CAD / IGI / renders.
  // The home dashboard uses this for the Media Approvals badge so the
  // admin sees the *total* number of items awaiting review.
  adminPendingCounts: () =>
    request<{
      total: number;
      photos: number;
      on_hold: number;
      cad: number;
      igi: number;
      renders: number;
    }>(`/admin/pending-counts`),
  // Daily commission activity for the home-dashboard bar chart. Supports
  // either a rolling `days` window or an explicit `date_from`/`date_to`.
  adminInsightsDaily: (
    arg:
      | number
      | { days?: number; date_from?: string; date_to?: string } = 30,
  ) => {
    const params =
      typeof arg === "number" ? { days: arg } : arg || {};
    const qs = new URLSearchParams();
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    if (!params.date_from && !params.date_to)
      qs.set("days", String(params.days ?? 30));
    return request<{
      days: number;
      start: string | null;
      end: string | null;
      series: {
        date: string;
        commissions: number;
        forwarded: number;
        dnas: number;
        total: number;
      }[];
      totals: { commissions: number; forwarded: number; dnas: number };
    }>(`/admin/insights/daily?${qs.toString()}`);
  },
  listRecycledPhotos: () => request<any>(`/photos/recycled`, { method: "GET" }),
  approvePhoto: (body: { order_id: string; step_number: number; photo_url: string }) =>
    request<any>(`/photos/approve`, { method: "POST", body: JSON.stringify(body) }),
  holdPhoto: (body: { order_id: string; step_number: number; photo_url: string }) =>
    request<any>(`/photos/hold`, { method: "POST", body: JSON.stringify(body) }),
  rejectPhoto: (body: { order_id: string; step_number: number; photo_url: string }) =>
    request<any>(`/photos/reject`, { method: "POST", body: JSON.stringify(body) }),
  reinstatePhoto: (body: { order_id: string; step_number: number; photo_url: string }) =>
    request<any>(`/photos/reinstate`, { method: "POST", body: JSON.stringify(body) }),
  /** Send a HOLD or REJECT moderation email to the original uploader.
   *  When `also_action` is true (default on server) the backend will also
   *  execute the matching hold/reject mutation atomically — so this single
   *  call can replace direct `holdPhoto` / `rejectPhoto` invocations. */
  sendModerationEmail: (body: {
    order_id: string;
    step_number: number;
    photo_url: string;
    kind: "hold" | "reject";
    recipient_email?: string;
    subject?: string;
    message?: string;
    also_action?: boolean;
  }) =>
    request<{
      ok: boolean;
      recipient: string;
      sent_at: string;
      deadline: string | null;
      email: any;
      action: any;
    }>(`/photos/moderation-email`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Send a HOLD or REJECT moderation email for a render upload. REJECT
   *  also removes the render from the admin approval queue atomically. */
  sendRenderModerationEmail: (
    orderId: string,
    renderId: string,
    body: {
      kind: "hold" | "reject";
      recipient_email?: string;
      subject?: string;
      message?: string;
      also_action?: boolean;
    },
  ) =>
    request<{
      ok: boolean;
      kind: "hold" | "reject";
      recipient: string;
      sent_at: string;
      deadline: string | null;
      action_executed: boolean;
    }>(`/orders/${orderId}/renders/${renderId}/moderation-email`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // ------------------------------------------------------------------------
  // In-app notifications
  // ------------------------------------------------------------------------
  listNotifications: (params: { limit?: number; unread_only?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.unread_only) qs.set("unread_only", "true");
    const tail = qs.toString();
    return request<{
      items: {
        id: string;
        user_id: string;
        type: string;
        title: string;
        body: string;
        link_route: string | null;
        link_params: Record<string, any> | null;
        payload: Record<string, any> | null;
        created_at: string;
        read_at: string | null;
      }[];
      unread_count: number;
    }>(`/notifications${tail ? `?${tail}` : ""}`);
  },
  unreadNotificationCount: () =>
    request<{ unread_count: number }>(`/notifications/unread-count`),
  markNotificationRead: (id: string) =>
    request<{ ok: boolean; unread_count: number }>(
      `/notifications/${id}/read`,
      { method: "POST" },
    ),
  markAllNotificationsRead: () =>
    request<{ ok: boolean; marked: number; unread_count: number }>(
      `/notifications/mark-all-read`,
      { method: "POST" },
    ),
  deleteNotification: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}`, { method: "DELETE" }),
  purgeExpiredPhotos: () => request<any>(`/photos/purge`, { method: "POST" }),
  // ---- Admin settings (feature flags) ----
  getAppSettings: () => request<any>(`/admin/settings`, { method: "GET" }),
  updateAppSettings: (body: { associate_approval_enabled?: boolean }) =>
    request<any>(`/admin/settings`, { method: "PUT", body: JSON.stringify(body) }),
  // ---- Manual language preference ----
  setMyLanguage: (language: string | null) =>
    request<User>("/users/me/language", {
      method: "PUT",
      body: JSON.stringify({ language }),
    }),
  translateStepNote: (
    orderId: string,
    stepNumber: number,
    target_lang: string,
    target_lang_name: string
  ) =>
    request<{
      target_lang: string;
      target_lang_name: string;
      notes_translated: string;
      associate_review_note_translated: string;
    }>(`/orders/${orderId}/steps/${stepNumber}/translate`, {
      method: "POST",
      body: JSON.stringify({ target_lang, target_lang_name }),
    }),
  forwardStep: (orderId: string, stepNumber: number, review_note: string) =>
    request<Order>(`/orders/${orderId}/steps/${stepNumber}/forward`, {
      method: "POST",
      body: JSON.stringify({ review_note }),
    }),
  updateCustoms: (orderId: string, payload: any) =>
    request<Order>(`/orders/${orderId}/customs`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getCustoms: (orderId: string) => request<CustomsBlob>(`/orders/${orderId}/customs`),
  addCustomsFile: (
    orderId: string,
    kind: CustomsKind,
    payload: CadFilePayload,
  ) =>
    request<CustomsFile>(`/orders/${orderId}/customs/files/${kind}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeCustomsFile: (orderId: string, kind: CustomsKind, fileId: string) =>
    request<{ ok: boolean }>(
      `/orders/${orderId}/customs/files/${kind}/${fileId}`,
      { method: "DELETE" },
    ),
  // ---- IGI Certificates ----------------------------------------------------
  // ---- IGI Certificates (per-order) --------------------------------------
  // Same approval flow as CAD: manufacturer uploads land in pending.
  listIgiCertificates: (orderId: string) =>
    request<{
      igi_certificates: CadFile[];
      pending_igi_certificates: CadFile[];
    }>(`/orders/${orderId}/igi-certificates`),
  addIgiCertificate: (orderId: string, payload: CadFilePayload) =>
    request<{
      file: CadFile;
      queue: "igi_certificates" | "pending_igi_certificates";
    }>(`/orders/${orderId}/igi-certificates`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  approveIgiCertificate: (orderId: string, fileId: string) =>
    request<{ ok: boolean; file: CadFile }>(
      `/orders/${orderId}/igi-certificates/${fileId}/approve`,
      { method: "POST" },
    ),
  rejectIgiCertificate: (orderId: string, fileId: string) =>
    request<{ ok: boolean }>(
      `/orders/${orderId}/igi-certificates/${fileId}/reject`,
      { method: "POST" },
    ),
  removeIgiCertificate: (orderId: string, fileId: string) =>
    request<{ ok: boolean }>(
      `/orders/${orderId}/igi-certificates/${fileId}`,
      { method: "DELETE" },
    ),
  // ---- CAD files (per-order) ---------------------------------------------
  // Returns {cad_files, pending_cad_files}. Manufacturer uploads land in
  // pending until an admin/associate approves.
  listCadFiles: (orderId: string) =>
    request<{ cad_files: CadFile[]; pending_cad_files: CadFile[] }>(
      `/orders/${orderId}/cad-files`,
    ),
  addCadFile: (orderId: string, payload: CadFilePayload) =>
    request<{ file: CadFile; queue: "cad_files" | "pending_cad_files" }>(
      `/orders/${orderId}/cad-files`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  approveCadFile: (orderId: string, fileId: string) =>
    request<{ ok: boolean; file: CadFile }>(
      `/orders/${orderId}/cad-files/${fileId}/approve`,
      { method: "POST" },
    ),
  rejectCadFile: (orderId: string, fileId: string) =>
    request<{ ok: boolean }>(
      `/orders/${orderId}/cad-files/${fileId}/reject`,
      { method: "POST" },
    ),
  removeCadFile: (orderId: string, fileId: string) =>
    request<{ ok: boolean }>(`/orders/${orderId}/cad-files/${fileId}`, {
      method: "DELETE",
    }),
  emailCadFiles: (
    orderId: string,
    payload: {
      recipients: string[];
      file_ids: string[];
      subject?: string | null;
      message?: string | null;
    },
  ) =>
    request<{
      ok: boolean;
      recipients: string[];
      file_count: number;
      provider_id: string | null;
    }>(`/orders/${orderId}/cad-files/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  emailIgiCertificates: (
    orderId: string,
    payload: {
      recipients: string[];
      file_ids: string[];
      subject?: string | null;
      message?: string | null;
    },
  ) =>
    request<{
      ok: boolean;
      recipients: string[];
      file_count: number;
      provider_id: string | null;
    }>(`/orders/${orderId}/igi-certificates/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  emailCustomsFiles: (
    orderId: string,
    kind: "airway-bill" | "customs",
    payload: {
      recipients: string[];
      file_ids: string[];
      subject?: string | null;
      message?: string | null;
    },
  ) =>
    request<{
      ok: boolean;
      recipients: string[];
      file_count: number;
      provider_id: string | null;
    }>(`/orders/${orderId}/customs/files/${kind}/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // ---- Renders (Phase 3) --------------------------------------------------
  assignCadRenderer: (orderId: string, cad_renderer_id: string | null) =>
    request<{ ok: boolean; cad_renderer_id: string | null; cad_renderer_name: string | null }>(
      `/orders/${orderId}/cad-renderer`,
      {
        method: "PUT",
        body: JSON.stringify({ cad_renderer_id }),
      },
    ),
  listRenders: (orderId: string) =>
    request<{
      renders: CadFile[];
      pending_renders: CadFile[];
      cad_renderer_id: string | null;
      cad_renderer_name: string | null;
    }>(`/orders/${orderId}/renders`),
  addRender: (orderId: string, payload: CadFilePayload) =>
    request<{ render: CadFile; queue: "renders" | "pending_renders" }>(
      `/orders/${orderId}/renders`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  approveRender: (orderId: string, renderId: string) =>
    request<{ ok: boolean; render: CadFile }>(
      `/orders/${orderId}/renders/${renderId}/approve`,
      { method: "POST" },
    ),
  rejectRender: (orderId: string, renderId: string) =>
    request<{ ok: boolean }>(`/orders/${orderId}/renders/${renderId}/reject`, {
      method: "POST",
    }),
  removeRender: (orderId: string, renderId: string) =>
    request<{ ok: boolean }>(`/orders/${orderId}/renders/${renderId}`, {
      method: "DELETE",
    }),
  // ---- Admin CAD Library (cross-order) ------------------------------------
  adminListAllCadFiles: (params?: {
    manufacturer_id?: string | null;
    client_id?: string | null;
    q?: string | null;
    date_from?: string | null;
    date_to?: string | null;
  }) => {
    const qs = new URLSearchParams();
    if (params?.manufacturer_id) qs.set("manufacturer_id", params.manufacturer_id);
    if (params?.client_id) qs.set("client_id", params.client_id);
    if (params?.q) qs.set("q", params.q);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<DocLibraryRow[]>(`/admin/cad-files${suffix}`);
  },
  adminEmailCrossOrderCadFiles: (payload: {
    recipients: string[];
    items: { order_id: string; file_id: string }[];
    subject?: string | null;
    message?: string | null;
  }) =>
    request<{
      ok: boolean;
      recipients: string[];
      file_count: number;
      order_count: number;
      provider_id: string | null;
    }>(`/admin/cad-files/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // ---- Admin Renders Library (cross-order) --------------------------------
  // Mirrors the CAD library endpoints exactly so the frontend can reuse the
  // same screen shell with a different data source. Filters by
  // `cad_renderer_id` (the vendor) instead of `manufacturer_id`.
  adminListAllRenders: (params?: {
    cad_renderer_id?: string | null;
    manufacturer_id?: string | null;
    client_id?: string | null;
    q?: string | null;
    date_from?: string | null;
    date_to?: string | null;
  }) => {
    const qs = new URLSearchParams();
    if (params?.cad_renderer_id) qs.set("cad_renderer_id", params.cad_renderer_id);
    if (params?.manufacturer_id) qs.set("manufacturer_id", params.manufacturer_id);
    if (params?.client_id) qs.set("client_id", params.client_id);
    if (params?.q) qs.set("q", params.q);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<
      (DocLibraryRow & {
        cad_renderer_id: string | null;
        cad_renderer_name: string | null;
      })[]
    >(`/admin/renders${suffix}`);
  },
  adminEmailCrossOrderRenders: (payload: {
    recipients: string[];
    items: { order_id: string; file_id: string }[];
    subject?: string | null;
    message?: string | null;
  }) =>
    request<{
      ok: boolean;
      recipients: string[];
      file_count: number;
      order_count: number;
      provider_id: string | null;
    }>(`/admin/renders/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // ---- Admin Document Libraries (cross-order) -----------------------------
  // Three sibling libraries that mirror the CAD/Renders shape exactly:
  // IGI certificates, airway-bill documents, and customs documents. All
  // three filter by `manufacturer_id` (workshop) and return a flat row
  // shape with the parent commission context folded in.
  adminListAllIgiCertificates: (params?: {
    manufacturer_id?: string | null;
    client_id?: string | null;
    q?: string | null;
    date_from?: string | null;
    date_to?: string | null;
  }) => {
    const qs = new URLSearchParams();
    if (params?.manufacturer_id) qs.set("manufacturer_id", params.manufacturer_id);
    if (params?.client_id) qs.set("client_id", params.client_id);
    if (params?.q) qs.set("q", params.q);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<DocLibraryRow[]>(`/admin/igi-certificates${suffix}`);
  },
  adminEmailCrossOrderIgi: (payload: DocLibraryEmailPayload) =>
    request<DocLibraryEmailResponse>(`/admin/igi-certificates/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminListAllAirwayBillFiles: (params?: {
    manufacturer_id?: string | null;
    client_id?: string | null;
    q?: string | null;
    date_from?: string | null;
    date_to?: string | null;
  }) => {
    const qs = new URLSearchParams();
    if (params?.manufacturer_id) qs.set("manufacturer_id", params.manufacturer_id);
    if (params?.client_id) qs.set("client_id", params.client_id);
    if (params?.q) qs.set("q", params.q);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<DocLibraryRow[]>(`/admin/airway-bill-files${suffix}`);
  },
  adminEmailCrossOrderAirwayBills: (payload: DocLibraryEmailPayload) =>
    request<DocLibraryEmailResponse>(`/admin/airway-bill-files/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminListAllCustomsFiles: (params?: {
    manufacturer_id?: string | null;
    client_id?: string | null;
    q?: string | null;
    date_from?: string | null;
    date_to?: string | null;
  }) => {
    const qs = new URLSearchParams();
    if (params?.manufacturer_id) qs.set("manufacturer_id", params.manufacturer_id);
    if (params?.client_id) qs.set("client_id", params.client_id);
    if (params?.q) qs.set("q", params.q);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<DocLibraryRow[]>(`/admin/customs-files${suffix}`);
  },
  adminEmailCrossOrderCustoms: (payload: DocLibraryEmailPayload) =>
    request<DocLibraryEmailResponse>(`/admin/customs-files/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listUsers: (role?: string) =>
    request<User[]>(`/users${role ? `?role=${role}` : ""}`),
  setAutoForward: (userId: string, auto_forward: boolean) =>
    request<any>(`/users/${userId}/auto-forward`, {
      method: "PUT",
      body: JSON.stringify({ auto_forward }),
    }),
  setAlias: (userId: string, alias: string) =>
    request<any>(`/users/${userId}/alias`, {
      method: "PUT",
      body: JSON.stringify({ alias }),
    }),
  backfillAliases: () =>
    request<any>("/admin/backfill-aliases", { method: "POST" }),
  setCountry: (userId: string, country: string) =>
    request<any>(`/users/${userId}/country`, {
      method: "PUT",
      body: JSON.stringify({ country }),
    }),
  listCountries: () =>
    request<{ code: string; name: string; language: string; language_name: string }[]>(
      "/meta/countries"
    ),
  createUser: (payload: {
    email: string;
    password: string;
    name: string;
    role: Role;
    associate_id?: string | null;
    country?: string;
    phone_dial_code?: string | null;
    phone_number?: string | null;
    birthday?: string | null;
    city?: string | null;
    state?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
  }) => request<User>("/users", { method: "POST", body: JSON.stringify(payload) }),
  getUser: (userId: string) => request<any>(`/users/${userId}`),
  updateUserProfile: (
    userId: string,
    payload: {
      name?: string;
      associate_id?: string | null;
      country?: string;
      phone_dial_code?: string | null;
      phone_number?: string | null;
      birthday?: string | null;
      city?: string | null;
      state?: string | null;
      address_line1?: string | null;
      address_line2?: string | null;
    },
  ) =>
    request<User>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteUser: (userId: string) =>
    request<any>(`/users/${userId}`, { method: "DELETE" }),
  setUserPassword: (userId: string, password: string) =>
    request<any>(`/users/${userId}/password`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    }),
  setManufacturerContacts: (
    userId: string,
    payload: { contacts: ManufacturerContact[]; primary_contact_id: string | null },
  ) =>
    request<{ ok: boolean; contacts: ManufacturerContact[]; primary_contact_id: string | null }>(
      `/users/${userId}/contacts`,
      { method: "PUT", body: JSON.stringify(payload) },
    ),
  // ---- Soft-delete / recycle bin ----
  softDeleteOrder: (orderId: string) =>
    request<{ ok: boolean; deleted_at?: string }>(`/orders/${orderId}`, {
      method: "DELETE",
    }),
  bulkSoftDeleteOrders: (ids: string[]) =>
    request<{ ok: boolean; deleted: number }>("/orders/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  listRecycleBin: () => request<RecycledOrder[]>("/admin/recycle-bin"),
  restoreOrder: (orderId: string) =>
    request<{ ok: boolean }>(`/admin/recycle-bin/${orderId}/restore`, {
      method: "POST",
    }),
  purgeOrder: (orderId: string) =>
    request<{ ok: boolean }>(`/admin/recycle-bin/${orderId}/purge`, {
      method: "DELETE",
    }),
  testTranslate: (text: string, target_lang: string, target_lang_name: string) =>
    request<{
      ok: boolean;
      source: string;
      target_lang: string;
      target_lang_name: string;
      translation: string;
      note?: string | null;
    }>("/admin/test-translate", {
      method: "POST",
      body: JSON.stringify({ text, target_lang, target_lang_name }),
    }),
  listLanguages: () =>
    request<
      { code: string; name: string; language: string; language_name: string }[]
    >("/admin/test-translate/languages"),
  fetchDigitalDna: async (
    orderId: string,
    opts: { includeNotes?: boolean; includePhotos?: boolean } = {}
  ): Promise<Blob> => {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const q = new URLSearchParams();
    if (opts.includeNotes) q.set("include_notes", "true");
    if (opts.includePhotos) q.set("include_photos", "true");
    const qs = q.toString();
    const res = await fetch(
      `${BASE_URL}/api/orders/${orderId}/digital-dna${qs ? "?" + qs : ""}`,
      { method: "GET", headers }
    );
    if (!res.ok) {
      let detail = "Failed to load Digital DNA";
      try {
        const j = await res.json();
        detail = typeof j.detail === "string" ? j.detail : detail;
      } catch {}
      throw new Error(detail);
    }
    return await res.blob();
  },
  digitalDnaUrl: (orderId: string) =>
    `${BASE_URL}/api/orders/${orderId}/digital-dna`,

  // ---------- Manufacturer directory ----------
  listManufacturers: (opts: { include_paused?: boolean; include_burned?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.include_paused !== undefined) q.set("include_paused", String(opts.include_paused));
    if (opts.include_burned !== undefined) q.set("include_burned", String(opts.include_burned));
    const tail = q.toString();
    return request<any[]>(`/admin/manufacturers${tail ? `?${tail}` : ""}`);
  },
  nextManufacturerCode: () => request<{ next_code: number }>("/admin/manufacturers/next-code"),
  createManufacturer: (body: {
    name: string;
    contact_email: string;
    contact_name?: string;
    contact_phone?: string;
    country?: string;
    notes?: string;
  }) => request<any>("/admin/manufacturers", { method: "POST", body: JSON.stringify(body) }),
  patchManufacturer: (id: string, body: any) =>
    request<any>(`/admin/manufacturers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  changeManufacturerStatus: (id: string, status: "active" | "paused" | "burned") =>
    request<any>(`/admin/manufacturers/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  bootstrapManufacturers: () =>
    request<any>("/admin/manufacturers/bootstrap", { method: "POST" }),
  syncPendingManufacturers: () =>
    request<any>("/admin/manufacturers/sync-pending", { method: "POST" }),

  // ---------- RFQs (admin) ----------
  listRfqs: (opts: { status?: string; origin?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.origin) q.set("origin", opts.origin);
    const tail = q.toString();
    return request<any[]>(`/admin/rfqs${tail ? `?${tail}` : ""}`);
  },
  getRfq: (id: string) => request<any>(`/admin/rfqs/${id}`),
  createBespokeRfq: (body: any) =>
    request<any>("/admin/rfqs", { method: "POST", body: JSON.stringify(body) }),
  ingestRfqsFromGemGallery: () =>
    request<any>("/admin/rfqs/ingest-from-gem-gallery", { method: "POST" }),
  broadcastRfq: (rfqId: string, manufacturer_ids: string[], admin_notes?: string) =>
    request<any>(`/admin/rfqs/${rfqId}/broadcast`, {
      method: "POST",
      body: JSON.stringify({ manufacturer_ids, admin_notes }),
    }),
  extendBroadcast: (rfqId: string, broadcastId: string) =>
    request<any>(`/admin/rfqs/${rfqId}/broadcasts/${broadcastId}/extend`, {
      method: "POST",
    }),
  recordBroadcastResponse: (rfqId: string, broadcastId: string, body: any) =>
    request<any>(`/admin/rfqs/${rfqId}/broadcasts/${broadcastId}/response`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  importBroadcastToQuote: (rfqId: string, broadcastId: string) =>
    request<any>(
      `/admin/rfqs/${rfqId}/import-to-quote?broadcast_id=${broadcastId}`,
      { method: "POST" },
    ),
  deleteRfq: (id: string) => request<any>(`/admin/rfqs/${id}`, { method: "DELETE" }),

  // ---------- RFQs (manufacturer) ----------
  mfgListRfqs: () => request<any[]>("/manufacturer/rfqs"),
  mfgGetRfq: (id: string) => request<any>(`/manufacturer/rfqs/${id}`),

  // ---------- Quotes ----------
  listQuotes: (freelance?: "true" | "false") =>
    request<any[]>(`/quotes${freelance ? `?freelance=${freelance}` : ""}`),
  createFreelanceQuote: (body: {
    piece_description?: string;
    jewelry_name?: string;
  }) =>
    request<any>(`/quotes/freelance`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getQuote: (id: string) => request<any>(`/quotes/${id}`),
  patchQuote: (id: string, body: any) =>
    request<any>(`/quotes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  computeQuoteTotals: (inputs: any) =>
    // FastAPI endpoint takes ``inputs: QuoteInputs`` at the request body
    // ROOT (not wrapped in `{ inputs }`). The wrapper caused every field
    // to fall back to defaults (zeros) — making the live preview useless.
    request<any>(`/quotes/compute`, { method: "POST", body: JSON.stringify(inputs) }),
  deleteQuote: (id: string) => request<any>(`/quotes/${id}`, { method: "DELETE" }),
  duplicateQuote: (id: string) =>
    request<any>(`/quotes/${id}/duplicate`, { method: "POST" }),
  /** Absolute URL for the quote PDF export endpoint — used to open
   *  the PDF in a new tab / share sheet. Auth headers must be added
   *  by the caller via `fetchQuotePdf` below. */
  quotePdfUrl: (id: string) => `${BASE_URL}/api/quotes/${id}/pdf`,
  fetchQuotePdf: async (id: string): Promise<Blob> => {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}/api/quotes/${id}/pdf`, {
      method: "GET",
      headers,
    });
    if (!res.ok) {
      let detail = "Failed to export quote PDF";
      try {
        const j = await res.json();
        detail = typeof j.detail === "string" ? j.detail : detail;
      } catch {}
      throw new Error(detail);
    }
    return await res.blob();
  },
  emailStepPhotos: (
    orderId: string,
    stepNumber: number,
    payload: {
      recipients: string[];
      file_ids: string[];
      subject?: string | null;
      message?: string | null;
    },
  ) =>
    request<{
      ok: boolean;
      recipients: string[];
      file_count: number;
      provider_id: string | null;
    }>(`/orders/${orderId}/steps/${stepNumber}/photos/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ---------- FX (daily-cached USD → AUD rate) ----------
  getUsdAudRate: (force = false) =>
    request<{
      pair: string;
      rate: number;
      fetched_at: string;
      source: string;
      upstream_updated_at?: string;
      stale?: boolean;
    }>(`/fx/usd-aud${force ? "?force=true" : ""}`),

  // ---------- Metals spot (cached daily, USD/g for atelier alloys) ----------
  getMetalSpot: (force = false) =>
    request<{
      captured_at: string;
      source: string;
      spot_usd_per_toz: { XAU: number; XAG: number; XPT: number };
      usd_per_gram: {
        gold_10k: number; gold_14k: number; gold_18k: number;
        platinum_pt950: number; silver_s925: number;
      };
      stale?: boolean;
    }>(`/fx/metal-spot${force ? "?force=true" : ""}`),

  // ---------- Competitor market anchor ----------
  listCompetitors: () =>
    request<any[]>(`/competitors`),
  compareQuote: (quoteId: string, opts: { force?: boolean; sites?: string[] } = {}) =>
    request<any>(`/quotes/${quoteId}/compare`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  getQuoteComparisons: (quoteId: string) =>
    request<any>(`/quotes/${quoteId}/comparisons`),
  getStoneSpecPrefill: (quoteId: string) =>
    request<{
      source: "rfq" | "none";
      atoms: {
        diamond_type?: string | null;
        diamond_carat?: number | null;
        diamond_shape?: string | null;
        diamond_color?: string | null;
        diamond_clarity?: string | null;
      };
      composed?: string;
      rfq_id?: string;
    }>(`/quotes/${quoteId}/stone-spec-prefill`),

  // --- Competitor library admin (Market Anchor scraper) ---------------
  listCompetitorsAdmin: () =>
    request<Array<{
      id: string; name: string;
      base_url: string; search_url: string;
      active: boolean; strategy?: string; feasibility?: string;
      notes?: string;
    }>>(`/admin/competitors`),
  updateCompetitor: (
    site_id: string,
    body: {
      name?: string; base_url?: string; search_url?: string;
      active?: boolean; strategy?: string; feasibility?: string;
      notes?: string;
    },
  ) =>
    request<any>(`/admin/competitors/${site_id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  createCompetitor: (body: {
    id?: string; name: string; base_url: string; search_url: string;
    strategy?: string; feasibility?: string; active?: boolean; notes?: string;
  }) =>
    request<any>(`/admin/competitors`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteCompetitor: (site_id: string) =>
    request<{ ok: boolean; hard: boolean }>(`/admin/competitors/${site_id}`, {
      method: "DELETE",
    }),
  testCompetitor: (site_id: string) =>
    request<{
      ok: boolean;
      site_name: string;
      url_tried: string;
      match_count: number;
      matches: Array<{ product_name?: string; price_native?: number; price_currency?: string; price_aud?: number; confidence?: number; url?: string }>;
      error?: string | null;
      elapsed_ms: number;
    }>(`/admin/competitors/${site_id}/test`, { method: "POST" }),
  resetCompetitor: (site_id: string) =>
    request<any>(`/admin/competitors/${site_id}/reset`, { method: "POST" }),

  // ---------- Client approval gates (Step 02) ----------
  releaseRenderForClient: (orderId: string, renderId: string, released: boolean) =>
    request<any>(`/orders/${orderId}/renders/${renderId}/release-for-client`, {
      method: "POST",
      body: JSON.stringify({ released }),
    }),
  getClientRenders: (orderId: string) =>
    request<{ released: any[]; approval: any }>(`/orders/${orderId}/client-renders`),
  postGate1: (orderId: string, status: "accepted" | "revision_requested", message?: string) =>
    request<any>(`/orders/${orderId}/client-approval/gate1`, {
      method: "POST",
      body: JSON.stringify({ status, message }),
    }),
  postGate2: (orderId: string, status: "yes" | "no") =>
    request<any>(`/orders/${orderId}/client-approval/gate2`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
};
