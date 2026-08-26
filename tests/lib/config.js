/**
 * Configuration for the system and acceptance suites.
 *
 * Everything is overridable from the environment so the same suites can run against a
 * local stack, a Compose stack on another port, or a staging deployment.
 *
 * No real credentials belong in this file. The accounts below are the demo accounts that
 * each service seeds on first start; they are documented in
 * docs/operations/running-locally.md and exist only in a development database.
 */

export const GATEWAY_URL = (process.env.GATEWAY_URL ?? 'http://localhost:8080').replace(/\/$/, '');

/** Route prefixes the gateway strips before forwarding. */
export const PREFIX = {
  user: '/user-manager',
  product: '/product-manager',
  order: '/order-manager',
};

/** Name of the cookie the platform carries its JWT in. */
export const AUTH_COOKIE = process.env.AUTH_COOKIE ?? 'springBootEcom';

/** Seeded development accounts. Override from the environment for any other environment. */
export const ACCOUNTS = {
  admin: {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'adminPass',
    roles: ['ROLE_ADMIN', 'ROLE_SELLER', 'ROLE_USER'],
  },
  seller: {
    username: process.env.SELLER_USERNAME ?? 'seller1',
    password: process.env.SELLER_PASSWORD ?? 'password2',
    roles: ['ROLE_SELLER'],
  },
  customer: {
    username: process.env.CUSTOMER_USERNAME ?? 'user1',
    password: process.env.CUSTOMER_PASSWORD ?? 'password1',
    roles: ['ROLE_USER'],
  },
  secondCustomer: {
    username: process.env.CUSTOMER2_USERNAME ?? 'user2',
    password: process.env.CUSTOMER2_PASSWORD ?? 'password1',
    roles: ['ROLE_USER'],
  },
};

/** How long to wait for any single request before treating the stack as unhealthy. */
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 15000);

/**
 * Set RUN_DESTRUCTIVE=1 to allow the suites that write real rows - placing an order,
 * creating an address. Off by default so the suites are safe to point at a shared
 * environment.
 */
export const RUN_DESTRUCTIVE = process.env.RUN_DESTRUCTIVE === '1';
