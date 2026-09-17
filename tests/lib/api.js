/**
 * Task-level helpers phrased in the platform's own vocabulary.
 *
 * The suites read better - and survive a path change better - when they say
 * "signIn(customer)" rather than repeating a URL. Nothing here asserts: helpers return
 * the raw response so each test decides what the expected status is.
 *
 * Since ADR-0012 the platform issues no tokens, so "signing in" here means obtaining a real
 * access token from Keycloak by password grant against the `techzone-tests` client. The
 * token is the same RS256 token a browser would get; only the redirect dance is skipped.
 */

import { ACCOUNTS, KEYCLOAK, PREFIX, tokenEndpoint } from './config.js';
import { Session } from './http.js';

export const paths = {
  // Sign-in, sign-up and sign-out are gone from the platform: they are Keycloak's, and
  // there is no HTTP path here to call. What is left under /api/auth reads the caller's
  // own token.
  currentUser: `${PREFIX.user}/api/auth/user`,
  currentUsername: `${PREFIX.user}/api/auth/username`,

  // SEC-02: user administration moved out from under the public /api/auth/** prefix.
  adminUsers: `${PREFIX.user}/api/admin/users`,
  sellers: `${PREFIX.user}/api/admin/users/sellers`,
  customers: `${PREFIX.user}/api/admin/users/customers`,

  myAddresses: `${PREFIX.user}/api/users/addresses`,
  addresses: `${PREFIX.user}/api/addresses`,

  products: `${PREFIX.product}/api/public/products`,
  brands: `${PREFIX.product}/api/public/products/brands`,
  categories: `${PREFIX.product}/api/public/categories`,
  productsByKeyword: (keyword) => `${PREFIX.product}/api/public/products/keyword/${encodeURIComponent(keyword)}`,
  productsInCategory: (categoryId) => `${PREFIX.product}/api/public/categories/${categoryId}/products`,
  specifications: (productId) => `${PREFIX.product}/api/public/products/${productId}/specifications`,
  adminProducts: `${PREFIX.product}/api/admin/products`,
  sellerProducts: `${PREFIX.product}/api/seller/products`,
  productAnalytics: `${PREFIX.product}/api/admin/app/analytics`,

  myCart: `${PREFIX.order}/api/carts/users/cart`,
  allCarts: `${PREFIX.order}/api/carts`,
  addToCart: (productId, quantity) => `${PREFIX.order}/api/carts/products/${productId}/quantity/${quantity}`,
  changeCartQuantity: (productId, operation) => `${PREFIX.order}/api/cart/products/${productId}/quantity/${operation}`,
  removeFromCart: (cartId, productId) => `${PREFIX.order}/api/carts/${cartId}/product/${productId}`,
  placeOrder: (paymentMethod) => `${PREFIX.order}/api/order/users/payments/${paymentMethod}`,
  myOrders: `${PREFIX.order}/api/order/users/orders`,
  adminOrders: `${PREFIX.order}/api/admin/orders`,
  sellerOrders: `${PREFIX.order}/api/seller/orders`,
};

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

async function postForm(url, fields) {
  const response = await fetch(url, {
    method: 'POST',
    headers: FORM,
    body: new URLSearchParams(fields).toString(),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body, text };
}

/**
 * Exchanges a password for an access token, the way the suites "sign in".
 *
 * Returns the session either way. A rejected password comes back as 401 from Keycloak
 * rather than from the platform, which is the point: the platform no longer has an opinion
 * about passwords.
 */
export async function signIn(account, session = new Session()) {
  const response = await postForm(tokenEndpoint(), {
    grant_type: 'password',
    client_id: KEYCLOAK.clientId,
    client_secret: KEYCLOAK.clientSecret,
    username: account.username,
    password: account.password,
    scope: 'openid email profile',
  });

  if (response.status === 200 && response.body?.access_token) {
    session.accessToken = response.body.access_token;
    session.identity = decodeClaims(response.body.access_token);
  } else {
    session.accessToken = null;
    session.identity = null;
  }

  return { session, response };
}

/** Signs in as one of the seeded roles, failing loudly if the credentials are rejected. */
export async function signInAs(role) {
  const account = ACCOUNTS[role];
  if (!account) throw new Error(`Unknown role in ACCOUNTS: ${role}`);

  const { session, response } = await signIn(account);
  if (!session.isAuthenticated) {
    throw new Error(
      `Could not obtain a token for "${account.username}" (status ${response.status}). ` +
      'Is Keycloak up and the techzone realm imported? See docs/operations/running-locally.md.',
    );
  }
  return session;
}

/** The access token's claims, without verifying it - these suites read it, they do not trust it. */
export function decodeClaims(accessToken) {
  const payload = accessToken.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

/** The realm roles in a session's token, as the gateway and the services see them. */
export function rolesOf(session) {
  return session.identity?.realm_access?.roles ?? [];
}

/**
 * A service-account token for Keycloak's Admin API.
 *
 * Used only to provision and clean up throw-away accounts. The suites need this because
 * registration is a browser flow on Keycloak's own page: there is no HTTP endpoint in this
 * platform that creates a customer, and ADR-0012 is explicit that adding one back would
 * rebuild the endpoint SEC-01 lived in.
 */
async function realmAdminToken() {
  const response = await postForm(tokenEndpoint(), {
    grant_type: 'client_credentials',
    client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? 'techzone-admin-api',
    client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ?? 'techzone-admin-api-dev-secret',
  });
  if (response.status !== 200 || !response.body?.access_token) {
    throw new Error(
      `Could not obtain a Keycloak service-account token (status ${response.status}). ` +
      'Set KEYCLOAK_ADMIN_CLIENT_SECRET to match the realm.',
    );
  }
  return response.body.access_token;
}

/**
 * Creates a throw-away customer directly in the realm and returns credentials that work.
 *
 * The password is set non-temporary on purpose. An account created through the platform's
 * own POST /api/admin/users gets a temporary one that Keycloak forces the holder to change
 * at first login - correct for a real seller, and untestable by password grant, which is
 * why that path has its own test rather than being used to build fixtures here.
 */
export async function registerFreshCustomer() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  const account = {
    username: `qa${suffix}@techzone.test`,
    email: `qa${suffix}@techzone.test`,
    password: 'QaPassw0rd',
  };

  const token = await realmAdminToken();
  const response = await fetch(`${KEYCLOAK.url}/admin/realms/${KEYCLOAK.realm}/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: account.email,
      email: account.email,
      firstName: 'QA',
      lastName: 'Customer',
      enabled: true,
      emailVerified: true,
      credentials: [{ type: 'password', value: account.password, temporary: false }],
    }),
  });

  return { account, response: { status: response.status } };
}

/** First page of the public catalogue, or an empty list when the shop has no products. */
export async function firstPageOfProducts(session, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await session.get(query ? `${paths.products}?${query}` : paths.products);
  const content = response.status === 200 ? (response.body?.content ?? []) : [];
  return { response, products: content };
}

/** A product with stock on hand, or null when the catalogue is empty or sold out. */
export async function anyProductInStock(session) {
  const { products } = await firstPageOfProducts(session, { pageSize: '50' });
  return products.find((product) => (product.quantity ?? 0) > 0) ?? null;
}

/** Empties the signed-in session's cart so a scenario starts from a known state. */
export async function emptyTheCart(session) {
  const cart = await session.get(paths.myCart);
  if (cart.status !== 200 || !cart.body) return;
  const cartId = cart.body.cartId;
  for (const product of cart.body.products ?? []) {
    await session.delete(paths.removeFromCart(cartId, product.productId));
  }
}
