const createRepo = () => ({
    mapValidOrders,
    parseSingleOrder,
});
const parseSingleOrder = (x: unknown) => validateAndParseOrder(x);
const mapValidOrders = (orders: unknown[]) => orders.map((o) => validateAndParseOrder(o));
// FM4: Factory returns object with property REFERENCES (not calls) to other functions.
// Fixer's extractDependenciesFor only finds CallExpressions - misses shorthand props.
// Mimics createSurrealOrderRepository returning { mapValidOrders, parseSingleOrder }.
const validateAndParseOrder = (x: unknown) => x;
