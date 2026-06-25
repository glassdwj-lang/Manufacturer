// API client for Somnio Atelier backend.
import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "somnio_token";

export type Role = "admin" | "manufacturer" | "associate" | "client";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  associate_id?: string | null;
  auto_forward?: boolean;
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
  associate_id: string | null;
  jewelry_name: string;
  sku: string;
  description: string;
  status: string;
  created_at: string;
  created_at_china: string;
  steps: Step[];
  customs?: any;
  progress?: { completed_count: number; total: number; current_step: number | null };
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
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  seed: () => request<any>("/seed", { method: "POST" }),
  seedExtended: () => request<any>("/seed-extended", { method: "POST" }),
  wipeDemo: () => request<any>("/admin/wipe-demo", { method: "POST" }),
  importAssociates: () => request<any>("/admin/import-associates", { method: "POST" }),
  importAssociatesStatus: () => request<any>("/admin/import-associates/status"),
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/auth/me"),
  listOrders: () => request<Order[]>("/orders"),
  getOrder: (id: string) => request<Order>(`/orders/${id}`),
  createOrder: (payload: any) =>
    request<Order>("/orders", { method: "POST", body: JSON.stringify(payload) }),
  completeStep: (orderId: string, stepNumber: number, notes: string, photos: string[]) =>
    request<Order>(`/orders/${orderId}/steps/${stepNumber}/complete`, {
      method: "POST",
      body: JSON.stringify({ notes, photos }),
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
  getCustoms: (orderId: string) => request<any>(`/orders/${orderId}/customs`),
  listUsers: (role?: string) =>
    request<User[]>(`/users${role ? `?role=${role}` : ""}`),
  setAutoForward: (userId: string, auto_forward: boolean) =>
    request<any>(`/users/${userId}/auto-forward`, {
      method: "PUT",
      body: JSON.stringify({ auto_forward }),
    }),
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
  }) => request<User>("/users", { method: "POST", body: JSON.stringify(payload) }),
  deleteUser: (userId: string) =>
    request<any>(`/users/${userId}`, { method: "DELETE" }),
};
