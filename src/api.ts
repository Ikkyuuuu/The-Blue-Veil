import type { ReadingView, SessionView } from '../shared/cards';
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export class Client {
  csrf = '';
  async request<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const headers: Record<string, string> = {};
    if (method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers,
        body,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new ApiError(
        'NETWORK',
        'The connection slipped away. Your reading is safe—try reconnecting.',
        0,
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        'UNAVAILABLE',
        'The tent is quiet for a moment. Please try again.',
        response.status,
      );
    }
    if (!response.ok) {
      const error = (data as { error?: { code?: string; message?: string } }).error;
      throw new ApiError(
        error?.code ?? 'UNAVAILABLE',
        error?.message ?? 'Please try again in a moment.',
        response.status,
      );
    }
    return data as T;
  }
  async session() {
    const data = await this.request<SessionView>('/api/session', 'POST', {});
    this.csrf = data.csrf;
    return data;
  }
  status() {
    return this.request<SessionView>('/api/session');
  }
  submit(question: string, requestId: string) {
    return this.request<ReadingView>('/api/readings', 'POST', { question, requestId });
  }
  draw(id: string, expectedIndex: number, actionId: string) {
    return this.request<ReadingView>(`/api/readings/${id}/draw`, 'POST', {
      expectedIndex,
      actionId,
    });
  }
  read(id: string) {
    return this.request<ReadingView>(`/api/readings/${id}`);
  }
  cancel(id: string) {
    return this.request(`/api/readings/${id}`, 'DELETE');
  }
}
