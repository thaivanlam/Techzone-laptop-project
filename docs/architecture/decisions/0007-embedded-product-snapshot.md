# ADR-0007: Embed a ProductSnapshot in order and cart items

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded retrospectively; the choice was made during backend development)
- **Affects:** order-service

## Context

`OrderItem` and `CartItem` need the product's name, price, and image to render a
cart and an order. The product record itself is owned by product-service and
lives in a different database, so a foreign key to it is not available across
the service boundary.

## Decision

Both embed a `ProductSnapshot` value object — name, price, image — captured when
the item is added, rather than referencing the product row.

## Consequences

**Positive.** This is not merely a workaround for the missing foreign key; it is
semantically the correct model. The snapshot records the product *as it was at
checkout*, so a later price edit by a seller cannot retroactively change what a
customer was charged on an order already placed. A foreign key would give the
wrong answer here even if it were technically possible.

**Negative.** Deliberate denormalization: product attributes are duplicated into
every order and cart row, and nothing cascades. A corrected product name never
propagates to historical orders — which is right for orders and arguably wrong
for a cart that has sat untouched for a week.

**If this is revisited.** It should not be for orders. For carts, refreshing the
snapshot on read — or at least flagging a price change before checkout — is the
improvement worth making.

## References

- Detail: [../../backend/services/order-service.md](../../backend/services/order-service.md)
- Related: [ADR-0008](0008-single-mysql-multiple-databases.md) — the data boundary this works around
- Related: [ADR-0009](0009-resttemplate-for-service-calls.md) — the other half of the cross-service story
