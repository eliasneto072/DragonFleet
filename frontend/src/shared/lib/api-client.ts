// src/shared/lib/api-client.ts
const BASE_URL = import.meta.env.VITE_API_URL;

const TOKEN_KEY         = 'dragonfleet:token';
const REFRESH_TOKEN_KEY = 'dragonfleet:refresh_token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export const tokenStorage = {
  getAccess:      ()        => localStorage.getItem(TOKEN_KEY),
  getRefresh:     ()        => localStorage.getItem(REFRESH_TOKEN_KEY),
  setAccess:      (t: string) => localStorage.setItem(TOKEN_KEY, t),
  setRefresh:     (t: string) => localStorage.setItem(REFRESH_TOKEN_KEY, t),
  clearAll:       ()        => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

// ── Refresh silencioso ────────────────────────────────────────────────────────

let isRefreshing   = false;
let refreshQueue: ((token: string) => void)[] = [];

async function doRefresh(): Promise<string> {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) throw new ApiError(401, 'NO_REFRESH_TOKEN', 'Session expired.');

  const res  = await fetch(`${BASE_URL}/auth/refresh`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refreshToken }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    tokenStorage.clearAll();
    throw new ApiError(401, 'REFRESH_FAILED', 'Session expired. Please log in again.');
  }

  const newToken = json?.data?.token ?? json?.token;
  tokenStorage.setAccess(newToken);
  return newToken;
}

// ── Request base ──────────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = tokenStorage.getAccess();

  // Num envio multipart o Content-Type tem de ser definido pelo browser: ele
  // acrescenta-lhe o `boundary` que separa as partes do corpo, e esse valor só
  // ele conhece. Cravar application/json em todos os pedidos, como era feito
  // aqui, fazia o servidor tentar ler o corpo como JSON e não encontrar nem os
  // campos nem o ficheiro.
  //
  // Era por causa disto que cada tela de envio nascia com o seu próprio fetch
  // cru (ver documents.service.ts e earnings-import.service.ts). Esses fetch
  // repetem o token e o tratamento de erro, e nenhum passa pela renovação
  // silenciosa abaixo — um token que expire a meio de um envio dá 401 em vez
  // de renovar. Detetar o FormData aqui traz os envios de ficheiro para o
  // mesmo caminho de todos os outros pedidos.
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res  = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));

  // Access token expirado — tenta renovar uma vez
  if (res.status === 401 && retry) {
    if (isRefreshing) {
      // Outra request já está a renovar — espera na fila
      return new Promise((resolve, reject) => {
        refreshQueue.push((newToken) => {
          headers['Authorization'] = `Bearer ${newToken}`;
          request<T>(path, { ...options, headers }, false).then(resolve).catch(reject);
        });
      });
    }

    isRefreshing = true;
    try {
      const newToken = await doRefresh();
      refreshQueue.forEach((cb) => cb(newToken));
      refreshQueue = [];
      isRefreshing = false;
      // Repete a request original com o novo token
      return request<T>(path, options, false);
    } catch (err) {
      refreshQueue = [];
      isRefreshing = false;
      // Redireciona para login se o refresh falhar
      window.location.href = '/login';
      throw err;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, json?.code ?? 'UNKNOWN_ERROR', json?.message ?? 'Ocorreu um erro inesperado.');
  }

  return (json.data ?? json) as T;
}

export const apiClient = {
  get:    <T>(path: string)                 => request<T>(path, { method: 'GET' }),
  post:   <T>(path: string, body: unknown)  => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)  => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH',  body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string)                => request<T>(path, { method: 'DELETE' }),

  /**
   * Envio multipart: campos e ficheiro no mesmo pedido.
   *
   * Existe para as telas de envio deixarem de precisar de fetch cru. Herdam
   * daqui o token, os erros em ApiError — com o `code` que o backend devolve,
   * que é o que permite distinguir BANK_ACCOUNT_REQUIRED de MISSING_RECEIPT —
   * e a renovação silenciosa da sessão.
   *
   * Repetir o pedido depois de renovar o token é seguro com FormData: ao
   * contrário de um stream, não é consumido pelo primeiro envio.
   */
  upload: <T>(path: string, form: FormData, method: 'POST' | 'PUT' | 'PATCH' = 'POST') =>
    request<T>(path, { method, body: form }),
};