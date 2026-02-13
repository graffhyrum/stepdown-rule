// Mimics order-repository: all top-level, mapValidOrders/parseSingleOrder call validateAndParseOrder
const generateOrderId = () => "id";
const calculateOrderTotal = (_: unknown) => 0;

const validateAndParseOrder = (x: unknown) => x;

const mapValidOrders = (orders: unknown[]) => orders.map((o) => validateAndParseOrder(o));

const parseSingleOrder = (x: unknown) => validateAndParseOrder(x);

const createSurrealOrderRepository = () => ({
	generateOrderId,
	calculateOrderTotal,
	mapValidOrders,
	parseSingleOrder,
});
