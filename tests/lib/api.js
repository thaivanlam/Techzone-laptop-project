/**
 * Task-level helpers phrased in the platform's own vocabulary.
 *
 * The suites read better - and survive a path change better - when they say
 * "signIn(customer)" rather than repeating a URL. Nothing here asserts: helpers return
 * the raw response so each test decides what the expected status is.
 */

import { ACCOUNTS, PREFIX } from './config.js';
import { Session } from './http.js';

export const paths = {
  signIn: `${PREFIX.user}/api/auth/signin`,
  signUp: `${PREFIX.user}/api/auth/signup`,
  signOut: `${PREFIX.user}/api/auth/signout`,
  currentUser: `${PREFIX.user}/api/auth/user`,
  currentUsername: `${PREFIX.user}/api/auth/username`,
  sellers: `${PREFIX.user}/api/auth/sellers`,
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

/** Signs in and returns the session; throws only if the platform is unreachable. */
export async function signIn(account, session = new Session()) {
  const response = await session.post(paths.signIn, {
    username: account.username,
    password: account.password,
  });
  session.identity = response.status === 200 ? response.body : null;
  return { session, response };
}

/** Signs in as one of the seeded roles, failing loudly if the credentials are rejected. */
export async function signInAs(role) {
  const account = ACCOUNTS[role];
  if (!account) throw new Error(`Unknown role in ACCOUNTS: ${role}`);

  const { session, response } = await signIn(account);
  if (response.status !== 200) {
    throw new Error(
      `Could not sign in as "${account.username}" (status ${response.status}). ` +
      'Is the demo data seeded? See docs/operations/running-locally.md.',
    );
  }
  return session;
}

/** Registers a throw-away account and returns the credentials that were used. */
export async function registerFreshCustomer(session = new Session()) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  const account = {
    username: `qa${suffix}`,
    email: `qa${suffix}@techzone.test`,
    password: 'QaPassw0rd',
  };
  const response = await session.post(paths.signUp, account);
  return { account, response };
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
