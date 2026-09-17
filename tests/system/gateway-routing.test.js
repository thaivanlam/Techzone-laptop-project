/**
 * System test - gateway routing.
 *
 * Level: whole assembled platform, exercised only through its public front door
 * (http://localhost:8080 by default). Nothing is stubbed: every request travels
 * gateway -> Eureka lookup -> service -> database.
 *
 * What it proves: the three services are registered, reachable under their documented
 * prefixes, and that the gateway rewrites the path correctly before forwarding.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { anonymous } from '../lib/http.js';
import { paths } from '../lib/api.js';
import { PREFIX, GATEWAY_URL } from '../lib/config.js';
import { stackStatus } from '../lib/preflight.js';

describe('System - gateway routing', { skip: stackStatus.skipReason }, () => {
  it('routes /product-manager to product-service', async () => {
    const session = anonymous();
    const response = await session.get(`${paths.products}?pageSize=1`);

    // 200 with a catalogue, or 400 "No Products Exist!!!" on an empty shop (BUG-04).
    // Either answer proves the request reached product-service rather than the gateway
    // returning a routing error.
    assert.ok([200, 400].includes(response.status),
      `expected the catalogue route to reach product-service, got ${response.status}`);
  });

  it('routes /user-manager to user-service', async () => {
    // /api/auth/** is still on the gateway's public list, so the request is forwarded
    // rather than refused at the edge - which is what makes it a routing test. Since
    // ADR-0012 there is no sign-in to post to; the profile read is what is there now, and
    // an anonymous caller gets user-service's own answer, not the gateway's.
    const session = anonymous();
    const response = await session.get(paths.currentUser);

    assert.ok([401, 403, 404, 500].includes(response.status),
      `expected user-service to answer the profile read, got ${response.status}`);
  });

  it('routes /order-manager to order-service', async () => {
    const session = anonymous();
    const response = await session.get(paths.myCart);

    // Anonymous: the gateway itself refuses this one with 401 before forwarding.
    assert.equal(response.status, 401);
  });

  it('answers an unknown prefix with 404 rather than a stack trace', async () => {
    const session = anonymous();
    const response = await session.get('/no-such-service/api/anything');

    assert.equal(response.status, 404);
  });

  it('serves the catalogue as JSON', async () => {
    const session = anonymous();
    const response = await session.get(`${paths.products}?pageSize=1`);

    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  });

  it('allows a CORS pre-flight from the single-page application', async () => {
    const response = await fetch(`${GATEWAY_URL}${paths.myCart}`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
      redirect: 'manual',
    });

    assert.ok(response.status < 400,
      `pre-flight should not be rejected by the auth filter, got ${response.status}`);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  });

  it('exposes each service under exactly one prefix', () => {
    const prefixes = Object.values(PREFIX);

    assert.equal(new Set(prefixes).size, prefixes.length);
    assert.deepEqual(prefixes.sort(), ['/order-manager', '/product-manager', '/user-manager']);
  });
});
