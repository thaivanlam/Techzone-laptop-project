/**
 * Preflight: decide whether a live stack is there to test against.
 *
 * System and acceptance tests are only meaningful against a running platform. Rather than
 * failing with a wall of connection errors, every suite imports `stackStatus` and skips
 * itself with one clear sentence when the gateway is not answering.
 */

import { pathToFileURL } from 'node:url';

import { GATEWAY_URL, PREFIX } from './config.js';

const PROBE_PATH = `${PREFIX.product}/api/public/products?pageSize=1`;

async function probe() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${GATEWAY_URL}${PROBE_PATH}`, {
      redirect: 'manual',
      signal: controller.signal,
    });
    // 400 is the documented answer for an empty catalogue (BUG-04) and still proves the
    // gateway routed the call to product-service, which is all the probe needs to know.
    return { reachable: true, status: response.status };
  } catch (error) {
    return { reachable: false, reason: error.cause?.code ?? error.name ?? String(error) };
  } finally {
    clearTimeout(timer);
  }
}

const result = await probe();

export const stackStatus = {
  ...result,
  gatewayUrl: GATEWAY_URL,
  /** A string when the suite should be skipped, false when it should run. */
  skipReason: result.reachable
    ? false
    : `No stack answering at ${GATEWAY_URL} (${result.reason}). ` +
      'Start it with "docker compose --profile prod up -d" - see docs/operations/running-locally.md.',
};

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  if (stackStatus.reachable) {
    console.log(`Stack is up at ${GATEWAY_URL} (probe answered ${stackStatus.status}).`);
  } else {
    console.log(stackStatus.skipReason);
    process.exitCode = 1;
  }
}
