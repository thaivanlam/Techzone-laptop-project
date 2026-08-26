/**
 * Unit tests for the single-page application's Redux reducers.
 *
 * Level: unit. A reducer is a pure function of (state, action) - the smallest testable
 * unit in the front end, and the one place where the shape of the client-side store is
 * decided. Nothing is rendered and no network call is made, so these run offline in
 * milliseconds with no stack and no npm install.
 *
 * The reducers are imported straight out of the frontend submodule; they have no imports
 * of their own, so Node can load them as plain ES modules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { cartReducer } from '../../frontend/src/store/reducers/cartReducer.js';
import { authReducer } from '../../frontend/src/store/reducers/authReducer.js';
import { productReducer } from '../../frontend/src/store/reducers/ProductReducer.js';
import { errorReducer } from '../../frontend/src/store/reducers/errorReducer.js';

const laptop = (productId, overrides = {}) => ({
  productId,
  productName: `Laptop ${productId}`,
  specialPrice: 900,
  quantity: 1,
  ...overrides,
});

describe('Unit - cartReducer', () => {
  it('starts with an empty cart', () => {
    const state = cartReducer(undefined, { type: '@@INIT' });

    assert.deepEqual(state, { cart: [], totalPrice: 0, cartId: null });
  });

  it('ignores an action it does not know', () => {
    const before = { cart: [laptop(7)], totalPrice: 900, cartId: 1 };

    assert.equal(cartReducer(before, { type: 'SOMETHING_ELSE' }), before);
  });

  it('ADD_CART appends a laptop that is not in the cart yet', () => {
    const state = cartReducer(undefined, { type: 'ADD_CART', payload: laptop(7) });

    assert.equal(state.cart.length, 1);
    assert.equal(state.cart[0].productId, 7);
  });

  it('ADD_CART replaces the line instead of duplicating it', () => {
    const before = { cart: [laptop(7, { quantity: 1 })], totalPrice: 900, cartId: 1 };

    const state = cartReducer(before, { type: 'ADD_CART', payload: laptop(7, { quantity: 3 }) });

    assert.equal(state.cart.length, 1, 'the same product must not appear twice');
    assert.equal(state.cart[0].quantity, 3);
  });

  it('ADD_CART leaves the other lines untouched', () => {
    const before = { cart: [laptop(7), laptop(8)], totalPrice: 1800, cartId: 1 };

    const state = cartReducer(before, { type: 'ADD_CART', payload: laptop(8, { quantity: 5 }) });

    assert.equal(state.cart.length, 2);
    assert.equal(state.cart.find((item) => item.productId === 7).quantity, 1);
    assert.equal(state.cart.find((item) => item.productId === 8).quantity, 5);
  });

  it('ADD_CART does not mutate the previous state', () => {
    const before = { cart: [laptop(7)], totalPrice: 900, cartId: 1 };
    const snapshot = JSON.stringify(before);

    cartReducer(before, { type: 'ADD_CART', payload: laptop(8) });

    assert.equal(JSON.stringify(before), snapshot, 'reducers must be pure');
  });

  it('REMOVE_CART drops only the named line', () => {
    const before = { cart: [laptop(7), laptop(8)], totalPrice: 1800, cartId: 1 };

    const state = cartReducer(before, { type: 'REMOVE_CART', payload: { productId: 7 } });

    assert.deepEqual(state.cart.map((item) => item.productId), [8]);
  });

  it('REMOVE_CART is harmless when the line is not there', () => {
    const before = { cart: [laptop(7)], totalPrice: 900, cartId: 1 };

    const state = cartReducer(before, { type: 'REMOVE_CART', payload: { productId: 99 } });

    assert.equal(state.cart.length, 1);
  });

  it('GET_USER_CART_PRODUCTS adopts the cart the server returned', () => {
    const state = cartReducer(undefined, {
      type: 'GET_USER_CART_PRODUCTS',
      payload: [laptop(7), laptop(8)],
      totalPrice: 1800,
      cartId: 42,
    });

    assert.equal(state.cart.length, 2);
    assert.equal(state.totalPrice, 1800);
    assert.equal(state.cartId, 42);
  });

  it('REMOVE_WHOLE_CART empties the lines but keeps the cart identity', () => {
    const before = { cart: [laptop(7)], totalPrice: 900, cartId: 42 };

    const state = cartReducer(before, { type: 'REMOVE_WHOLE_CART' });

    assert.deepEqual(state.cart, []);
    assert.equal(state.cartId, 42);
  });

  it('CLEAR_CART resets everything, as it must after checkout', () => {
    const before = { cart: [laptop(7)], totalPrice: 900, cartId: 42 };

    const state = cartReducer(before, { type: 'CLEAR_CART' });

    assert.deepEqual(state, { cart: [], totalPrice: 0, cartId: null });
  });
});

describe('Unit - authReducer', () => {
  it('starts signed out', () => {
    const state = authReducer(undefined, { type: '@@INIT' });

    assert.equal(state.user, null);
    assert.deepEqual(state.address, []);
  });

  it('LOGIN_USER stores the identity', () => {
    const user = { id: 4, username: 'buyer1', roles: ['ROLE_USER'] };

    const state = authReducer(undefined, { type: 'LOGIN_USER', payload: user });

    assert.deepEqual(state.user, user);
  });

  it('SELECT_CHECKOUT_ADDRESS and REMOVE_CHECKOUT_ADDRESS are symmetrical', () => {
    const chosen = authReducer(undefined, {
      type: 'SELECT_CHECKOUT_ADDRESS',
      payload: { addressId: 11 },
    });
    assert.deepEqual(chosen.selectedUserCheckoutAddress, { addressId: 11 });

    const cleared = authReducer(chosen, { type: 'REMOVE_CHECKOUT_ADDRESS' });
    assert.equal(cleared.selectedUserCheckoutAddress, null);
  });

  it('REMOVE_CLIENT_SECRET_ADDRESS clears both the payment secret and the address', () => {
    const before = {
      user: { id: 4 },
      clientSecret: 'pi_secret',
      selectedUserCheckoutAddress: { addressId: 11 },
    };

    const state = authReducer(before, { type: 'REMOVE_CLIENT_SECRET_ADDRESS' });

    assert.equal(state.clientSecret, null);
    assert.equal(state.selectedUserCheckoutAddress, null);
    assert.deepEqual(state.user, { id: 4 }, 'signing out is a different action');
  });

  it('LOG_OUT forgets the user', () => {
    const before = { user: { id: 4 }, address: [{ addressId: 11 }], clientSecret: 'pi_secret' };

    const state = authReducer(before, { type: 'LOG_OUT' });

    assert.equal(state.user, null);
  });

  it('FETCH_SELLERS records the page metadata alongside the rows', () => {
    const state = authReducer(undefined, {
      type: 'FETCH_SELLERS',
      payload: [{ userId: 6 }],
      pageNumber: 0,
      pageSize: 10,
      totalElements: 1,
      totalPages: 1,
      lastPage: true,
    });

    assert.equal(state.sellers.length, 1);
    assert.equal(state.pagination.totalElements, 1);
    assert.equal(state.pagination.lastPage, true);
  });
});

describe('Unit - productReducer', () => {
  it('starts with nothing loaded', () => {
    const state = productReducer(undefined, { type: '@@INIT' });

    assert.equal(state.products, null);
    assert.deepEqual(state.brands, []);
  });

  it('FETCH_PRODUCTS stores the rows and the paging fields the listing needs', () => {
    const state = productReducer(undefined, {
      type: 'FETCH_PRODUCTS',
      payload: [laptop(7), laptop(8)],
      pageNumber: 1,
      pageSize: 6,
      totalElements: 14,
      totalPages: 3,
      lastPage: false,
    });

    assert.equal(state.products.length, 2);
    assert.deepEqual(state.pagination, {
      pageNumber: 1,
      pageSize: 6,
      totalElements: 14,
      totalPages: 3,
      lastPage: false,
    });
  });

  it('FETCH_CATEGORIES does not wipe the products already loaded', () => {
    const before = productReducer(undefined, {
      type: 'FETCH_PRODUCTS',
      payload: [laptop(7)],
      pageNumber: 0,
      pageSize: 6,
      totalElements: 1,
      totalPages: 1,
      lastPage: true,
    });

    const state = productReducer(before, { type: 'FETCH_CATEGORIES', payload: [{ categoryId: 1 }] });

    assert.equal(state.products.length, 1);
    assert.equal(state.categories.length, 1);
  });

  it('FETCH_BRANDS stores the brand facet', () => {
    const state = productReducer(undefined, { type: 'FETCH_BRANDS', payload: ['Acer', 'Dell', 'MSI'] });

    assert.deepEqual(state.brands, ['Acer', 'Dell', 'MSI']);
  });
});

describe('Unit - errorReducer', () => {
  it('starts idle', () => {
    const state = errorReducer(undefined, { type: '@@INIT' });

    assert.equal(state.isLoading, false);
    assert.equal(state.errorMessage, null);
  });

  it('IS_FETCHING turns the spinner on and clears any earlier message', () => {
    const before = { isLoading: false, errorMessage: 'Something went wrong' };

    const state = errorReducer(before, { type: 'IS_FETCHING' });

    assert.equal(state.isLoading, true);
    assert.equal(state.errorMessage, null);
  });

  it('IS_ERROR turns the spinner off and shows the message', () => {
    const before = errorReducer(undefined, { type: 'IS_FETCHING' });

    const state = errorReducer(before, { type: 'IS_ERROR', payload: 'No Products Exist!!!' });

    assert.equal(state.isLoading, false);
    assert.equal(state.errorMessage, 'No Products Exist!!!');
  });

  it('IS_SUCCESS clears every loading flag at once', () => {
    const before = { isLoading: true, btnLoader: true, categoryLoader: true, errorMessage: 'stale' };

    const state = errorReducer(before, { type: 'IS_SUCCESS' });

    assert.equal(state.isLoading, false);
    assert.equal(state.btnLoader, false);
    assert.equal(state.categoryLoader, false);
    assert.equal(state.errorMessage, null);
  });

  it('a failed request never leaves the button spinner running', () => {
    const before = errorReducer(undefined, { type: 'BUTTON_LOADER' });
    assert.equal(before.btnLoader, true);

    const state = errorReducer(before, { type: 'IS_ERROR', payload: 'Cart is empty' });

    assert.equal(state.btnLoader, false, 'a stuck button spinner blocks the whole checkout');
  });
});
