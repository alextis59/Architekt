import { afterEach, describe, expect, it, vi } from 'vitest';

const authMocks = {
  getAuthToken: vi.fn(),
  notifyUnauthorized: vi.fn()
};

vi.mock('../auth/tokenStore.js', () => authMocks);

const { apiRequest } = await import('./client.js');

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    authMocks.getAuthToken.mockReset();
    authMocks.notifyUnauthorized.mockReset();
  });

  it('attaches auth headers when a token is available and parses json responses', async () => {
    authMocks.getAuthToken.mockReturnValue('token-123');

    const responsePayload = { ok: true };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => responsePayload
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest<{ ok: boolean }>('/demo', {
      method: 'POST',
      headers: { 'X-Test': 'value' },
      body: JSON.stringify({})
    });

    expect(result).toEqual(responsePayload);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/demo'), {
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123',
        'Content-Type': 'application/json',
        'X-Test': 'value'
      }),
      body: JSON.stringify({})
    });
  });

  it('notifies unauthorized handler and throws when a request returns 401', async () => {
    authMocks.getAuthToken.mockReturnValue('expired-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Unauthorized' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/secure')).rejects.toMatchObject({ status: 401, payload: { message: 'Unauthorized' } });
    expect(authMocks.notifyUnauthorized).toHaveBeenCalled();
  });

  it('returns null for non-json responses and tolerates malformed payloads', async () => {
    authMocks.getAuthToken.mockReturnValue(null);

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
      json: async () => ({})
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest('/no-content');
    expect(result).toBeNull();

    const malformedResponse = {
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => {
        throw new Error('boom');
      }
    };
    fetchMock.mockResolvedValueOnce(malformedResponse);

    await expect(apiRequest('/malformed')).rejects.toMatchObject({ status: 500, payload: null });
  });
});
