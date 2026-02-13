/**
 * Minimal repro for 27g: export function first, arrow consts below, validateAndParseOrder in wrong position
 * Structure matches ff-elysia order-repository
 */
function createSurrealOrderRepository() {
	return {
		save: () => generateOrderId(),
		getById: () => parseSingleOrder(undefined),
		getAll: () => mapValidOrders([]),
	};
}

function validateAndParseOrder(_x: unknown) {
	return _x;
}

const mapValidOrders = (orders: unknown[]) => orders.map((o) => validateAndParseOrder(o));
const parseSingleOrder = (results: unknown[] | undefined) =>
	results?.length ? validateAndParseOrder(results[0]) : null;
const calculateOrderTotal = (_: unknown) => 0;
const generateOrderId = () => "id";
