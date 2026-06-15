import { useAuthStore } from '../stores/auth';
import type { ApiResponse } from './types';

const BASE_URL = '/api';

interface ApiErrorResponse {
  success: false;
  error?: string;
  details?: string[];
}

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = useAuthStore.getState().token;

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && token && path !== '/auth/refresh') {
      // Try refreshing the token before giving up
      const newToken = await this.refreshToken();
      if (newToken) {
        // Retry the original request with the new token
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        const retryResponse = await fetch(`${BASE_URL}${path}`, { ...options, headers: retryHeaders });
        const retryJson: ApiResponse<T> = await retryResponse.json();
        if (retryResponse.ok && retryJson.success) {
          return retryJson.data;
        }
      }
      useAuthStore.getState().logout();
      throw new Error('Session expired');
    }

    const json = await response.json() as ApiResponse<T> | ApiErrorResponse;

    if (!response.ok || !json.success) {
      const detailMessage = Array.isArray((json as ApiErrorResponse).details)
        ? (json as ApiErrorResponse).details!.join(', ')
        : '';
      const message = json.error || `Request failed: ${response.status}`;
      throw new Error(detailMessage ? `${message}: ${detailMessage}` : message);
    }

    return (json as ApiResponse<T>).data;
  }

  private refreshPromise: Promise<string | null> | null = null;

  private async refreshToken(): Promise<string | null> {
    // Coalesce concurrent refresh attempts
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const currentToken = useAuthStore.getState().token;
        if (!currentToken) return null;

        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentToken}`,
          },
        });

        if (!res.ok) return null;

        const json: ApiResponse<{ token: string }> = await res.json();
        if (!json.success || !json.data.token) return null;

        const user = useAuthStore.getState().user;
        if (user) {
          useAuthStore.getState().setToken(json.data.token, user);
        }
        return json.data.token;
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  upload<T>(path: string, formData: FormData): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: formData,
    });
  }

  async getBlob(path: string): Promise<Blob> {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, { headers });
    if (!response.ok) {
      let message = `Request failed: ${response.status}`;
      try {
        const json = await response.json() as ApiErrorResponse;
        if (json.error) message = json.error;
      } catch {
        // ignore parse failure
      }
      throw new Error(message);
    }

    return response.blob();
  }
}

export const api = new ApiClient();
