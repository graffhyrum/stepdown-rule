import { rmSync } from "node:fs";

try {
	rmSync("tsconfig.types.tsbuildinfo");
} catch {
	/* already absent */
}
