export interface FunctionInfo {
	name: string;
	kind: "declaration" | "arrow-function" | "function-expression";
	position: {
		line: number;
		column: number;
		start: number;
		end: number;
	};
	isExported: boolean;
	dependencies: string[];
	canBeFunctionDeclaration: boolean;
	/** Name of the parent function if this is a nested function, null for top-level functions */
	parentFunction: string | null;
}

export interface CallSite {
	line: number;
	column: number;
}

export interface StepdownViolation {
	file: string;
	function: FunctionInfo;
	dependency: FunctionInfo;
	message: string;
	callSite: CallSite;
}

export interface NestedFunctionViolation {
	file: string;
	parent: FunctionInfo;
	nested: FunctionInfo;
	message: string;
}

export interface AnalysisResult {
	file: string;
	violations: StepdownViolation[];
	nestedFunctionViolations: NestedFunctionViolation[];
	circularDependencies: string[][];
	totalFunctions: number;
	/** Top-level function -> callees (for fixer to use same view as analyzer) */
	dependencyGraph?: Map<string, string[]>;
}

export interface FixResult {
	file: string;
	fixed: boolean;
	originalContent: string;
	fixedContent: string;
	reordered: number;
	errors: string[];
}

// Re-export schemas from config module for backward compatibility
export type { Config, FileConfig } from "./config/schema";
export {
	ConfigJsonSchema,
	ConfigSchema,
	FileConfigJsonSchema,
	FileConfigSchema,
} from "./config/schema";
