/**
 * A very small HTTP client for the end-to-end suites.
 *
 * The platform authenticates with a cookie, and Node's fetch does not keep a cookie jar,
 * so a Session holds the cookies it is given and sends them back - which is exactly what a
 * browser does, and therefore what these tests need in order to exercise the real
 * authentication path rather than a bearer-token shortcut.
 */

import { AUTH_COOKIE, GATEWAY_URL, REQUEST_TIMEOUT_MS } from './config.js';

export class Session {
  constructor(baseUrl = GATEWAY_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.cookies = new Map();
    this.identity = null;
  }

  get authCookie() {
    return this.cookies.get(AUTH_COOKIE) ?? null;
  }

  get isAuthenticated() {
    const token = this.authCookie;
    return typeof token === 'string' && token.length > 0;
  }

  #storeCookies(response) {
    const raw = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);

    for (const header of raw) {
      const [pair] = header.split(';');
      const separator = pair.indexOf('=');
      if (separator < 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (value === '' || /Max-Age=0/i.test(header)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  #cookieHeader() {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
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

    const cookieHeader = this.#cookieHeader();
    if (cookieHeader) requestHeaders.Cookie = cookieHeader;

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

    this.#storeCookies(response);

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

  /** Drops every cookie, returning the session to an anonymous state. */
  reset() {
    this.cookies.clear();
    this.identity = null;
  }
}

/** A fresh anonymous session. */
export function anonymous() {
  return new Session();
}
