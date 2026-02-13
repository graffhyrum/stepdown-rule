// FM2/FM4: From rate-limiting.ts - createX calls multiple helpers (some at multiple call sites).
const setRateLimitHeaders = () => {};
const generateRateLimitKey = () => "key";
const createRateLimitError = () => new Error("limit");
const createRateLimit = () => {
	setRateLimitHeaders();
	const key = generateRateLimitKey();
	setRateLimitHeaders();
	if (!key) throw createRateLimitError();
};
