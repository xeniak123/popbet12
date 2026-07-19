// API client with JWT bearer token from secure storage.
import { storage } from "@/src/utils/storage";

const RAW_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const BASE_URL = (RAW_BASE_URL || "").trim().replace(/\/+$/, "");
export const HAS_BACKEND_URL = !!BASE_URL;
export const TOKEN_KEY = "popbet_token";

if (!HAS_BACKEND_URL) {
  // Loud warning in dev logs — surfaces in Metro / browser console.
  // eslint-disable-next-line no-console
  console.warn(
    "[PopBet] EXPO_PUBLIC_BACKEND_URL is not set. Create /app/frontend/.env " +
      "from .env.example and set the backend URL (see /app/frontend/SETUP.md).",
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function assertBackend(): void {
  if (!HAS_BACKEND_URL) {
    throw new Error(
      "Brak adresu backendu. Utwórz plik frontend/.env z EXPO_PUBLIC_BACKEND_URL " +
        "(patrz SETUP.md) i zrestartuj `npx expo start`.",
    );
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  assertBackend();
  const res = await fetch(`${BASE_URL}${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `GET ${path} failed`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  assertBackend();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `POST ${path} failed`;
    try {
      const parsed = await res.json();
      detail = parsed?.detail || parsed?.message || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  assertBackend();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: await authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = `${method} ${path} failed`;
    try {
      const parsed = await res.json();
      detail = parsed?.detail || parsed?.message || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export const api = {
  get: apiGet,
  post: apiPost,
  patch: <T,>(path: string, body?: unknown) => apiRequest<T>("PATCH", path, body ?? {}),
  request: <T,>(method: string, path: string, body?: unknown) => apiRequest<T>(method, path, body),
  baseUrl: BASE_URL,
};
