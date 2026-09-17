/**
 * Configuration for the system and acceptance suites.
 *
 * Everything is overridable from the environment so the same suites can run against a
 * local stack, a Compose stack on another port, or a staging deployment.
 *
 * No real credentials belong in this file. The accounts below are the demo accounts in
 * backend/keycloak/realm-techzone.json; they are documented in
 * docs/operations/running-locally.md and exist only in a development realm.
 */

export const GATEWAY_URL = (process.env.GATEWAY_URL ?? 'http://localhost:8080').replace(/\/$/, '');

/** Route prefixes the gateway strips before forwarding. */
export const PREFIX = {
  user: '/user-manager',
  product: '/product-manager',
  order: '/order-manager',
};

/**
 * Keycloak, since ADR-0012.
 *
 * The suites obtain a real access token by password grant against the `techzone-tests`
 * client, rather than driving a browser through Authorization Code + PKCE. That client
 * exists for exactly this and is the only one in the realm with direct access grants
 * enabled — `techzone-spa` has them switched off, so no password ever reaches the client
 * the application actually uses.
 *
 * The token is real: RS256, issued by the realm, carrying the same `realm_access.roles` the
 * browser's token carries. What is skipped is the redirect dance, not the verification.
 */
export const KEYCLOAK = {
  url: (process.env.KEYCLOAK_URL ?? 'http://localhost:8090').replace(/\/$/, ''),
  realm: process.env.KEYCLOAK_REALM ?? 'techzone',
  clientId: process.env.KEYCLOAK_TESTS_CLIENT_ID ?? 'techzone-tests',
  clientSecret: process.env.KEYCLOAK_TESTS_CLIENT_SECRET ?? 'techzone-tests-dev-secret',
};

export const tokenEndpoint = () =>
  `${KEYCLOAK.url}/realms/${KEYCLOAK.realm}/protocol/openid-connect/token`;

/**
 * Seeded development accounts.
 *
 * Usernames are email addresses because the realm is configured email-as-username. The
 * passwords are the demo ones from the realm import: ADR-0012 records that existing BCrypt
 * hashes could not be carried over — Keycloak ships PBKDF2 and Argon2, not BCrypt — so the
 * accounts were recreated and every previous password was invalidated.
 */
export const ACCOUNTS = {
  admin: {
    username: process.env.ADMIN_USERNAME ?? 'admin@example.com',
    password: process.env.ADMIN_PASSWORD ?? 'adminPass',
    // Composite: ROLE_ADMIN includes ROLE_SELLER includes ROLE_USER, and Keycloak expands
    // them into the token, so an admin's token really does carry all three.
    roles: ['ROLE_ADMIN', 'ROLE_SELLER', 'ROLE_USER'],
  },
  seller: {
    username: process.env.SELLER_USERNAME ?? 'seller1@example.com',
    password: process.env.SELLER_PASSWORD ?? 'password2',
    roles: ['ROLE_SELLER', 'ROLE_USER'],
  },
  customer: {
    username: process.env.CUSTOMER_USERNAME ?? 'user1@example.com',
    password: process.env.CUSTOMER_PASSWORD ?? 'password1',
    roles: ['ROLE_USER'],
  },
  secondCustomer: {
    username: process.env.CUSTOMER2_USERNAME ?? 'user2@example.com',
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
