/**
 * A very small HTTP client for the end-to-end suites.
 *
 * Since ADR-0012 the platform authenticates with `Authorization: Bearer <token>` and there
 * is no cookie at all, so this no longer keeps a cookie jar. A Session holds an access
 * token and sends it on every request — which is what the SPA does, and therefore what
 * these tests need in order to exercise the real authentication path.
 */

import { GATEWAY_URL, REQUEST_TIMEOUT_MS } from './config.js';

export class Session {
  constructor(baseUrl = GATEWAY_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.accessToken = null;
    this.identity = null;
  }

  get isAuthenticated() {
    return typeof this.accessToken === 'string' && this.accessToken.length > 0;
  }

  /**
   * Performs a request and always resolves, even for 4xx and 5xx: these suites assert on
   * status codes, so a non-2xx is data, not an error.
   *
   * @returns {Promise<{status: number, headers: Headers, body: any, text: string}>}
   */
  async request(method, path, { body, headers = {}, json = true } = {}) {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const requestHeaders = { ...headers };

    if (this.isAuthenticated && requestHeaders.Authorization === undefined) {
      requestHeaders.Authorization = `Bearer ${this.accessToken}`;
    }

    let payload;
    if (body !== undefined) {
      if (json) {
        requestHeaders['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      } else {
        payload = body;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: payload,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    return { status: response.status, headers: response.headers, body: parsed, text };
  }

  get(path, options) {
    return this.request('GET', path, options);
  }

  post(path, body, options) {
    return this.request('POST', path, { ...options, body });
  }

  put(path, body, options) {
    return this.request('PUT', path, { ...options, body });
  }

  delete(path, options) {
    return this.request('DELETE', path, options);
  }

  /** Drops the token, returning the session to an anonymous state. */
  reset() {
    this.accessToken = null;
    this.identity = null;
  }
}

/** A fresh anonymous session. */
export function anonymous() {
  return new Session();
}
