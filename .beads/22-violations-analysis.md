# 22 Persistent Violations - Failure Mode Taxonomy

Analysis of violations that remain after `stepdown-rule --fix` in ff-elysia.

## Failure Mode Mapping

| FM | Description | Affected Files | Bead |
|----|-------------|----------------|------|
| **FM1** | Nested functions inside callback (fixer never sees them) | session.ts | stepdown-rule-db8 (Fixer5), stepdown-rule-aka (Fixer7) |
| **FM2** | Arrow functions in const - topo sort chain breaks | order-repository, wishlist-repository | stepdown-rule-27g (Fixer1) |
| **FM3** | Fix creates new violations - ping-pong, no convergence | cart-composition, container | stepdown-rule-96h (Fixer3), stepdown-rule-0om (Fixer6) |
| **FM4** | Dep graph misses deps or analyzer/fixer diverge | cart, container, order-repo | stepdown-rule-1e0 (Fixer2), stepdown-rule-hje (Fixer8) |
| **FM5** | Mutual dep pairs - fix one creates other | product-handlers | stepdown-rule-96h |

**Master reference:** stepdown-rule-aad

## Violation Detail by File

### src/plugins/session.ts (FM1)
- ensureSessionCookie calls getSessionId - both inside `.derive()` callback
- Fixer: categorizeNodes only iterates sourceFile direct children; these are inside sessionPlugin initializer

### src/di/cart-composition.ts (FM3/FM4)
- composeCartDomain calls createCartPresenter, createCartUseCase, createCartController
- After fix: composeCartDomain calls sessionStoreToRepository (violation flips)
- Fixer reordered 1 function; ping-pong between violation sets

### src/di/container.ts (FM3/FM4)
- createMockServices calls createServices
- Multi-level DI: createServices→createSurrealServices→createSurrealRepositories
- Fix reordered 3 but violations persist or reappear as different set

### src/handlers/product-handlers.ts (FM5)
- createProduct calls generateSlug / removeProduct calls findProductIndex
- Fix reorders 1; next run shows the other pair violated
- Mutual pairs - resolving one exposes the other

### src/infrastructure/surreal/order-repository.ts (FM2/FM4)
- createSurrealOrderRepository (factory) calls: generateOrderId, calculateOrderTotal, parseSingleOrder, mapValidOrders
- mapValidOrders, parseSingleOrder call validateAndParseOrder (arrow chain)
- Fix reordered 5; 9 violations persist
- Arrow function dep chain not fully captured in topo sort

### src/infrastructure/surreal/wishlist-repository.ts (FM2)
- addItemToWishlist, removeItemFromWishlist call findByUserId
- findByUserId calls parseSingleWishlist; createSurrealWishlistRepository calls all
- Arrow function ordering

### src/instrumentation.ts (FM4)
- createSpan calls loadOpenTelemetry, setSpanAttributes, recordSpanError
- Fix reordered 0 then 2 in different runs; violations persist

### src/services/email.ts (FM3/FM4)
- sendOrderReceiptEmail calls renderOrderReceiptText / createTransporter
- Fix reordered 2; violations flip between runs

### src/utils/rate-limiting.ts (FM2/FM4)
- createRateLimit calls setRateLimitHeaders (2 call sites), generateRateLimitKey, createRateLimitError
- Fix reordered 3; createRateLimit calls setRateLimitHeaders persists

## Gap Summary

1. **Fixer uses forEachChild(sourceFile)** - nested functions never reach reorder pipeline
2. **Fixer rebuilds deps independently** - does not use analyzer call graph; extraction may differ
3. **Topo sort reversal** - may not minimize violations when DAG has multiple valid orderings
4. **No idempotency** - fix→analyze loop oscillates (22↔27) instead of converging to 0
