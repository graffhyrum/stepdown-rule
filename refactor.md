# Refactor Plan: ArkType Integration & Runtime Config Validation

## Overview
Refactor `src/types.ts` to use ArkType for schema validation, generate JSON schema for `.stepdownrc.json` files, and implement runtime config validation.

## Current State
- Configuration is CLI-only with a `--config` option that exists but is never implemented
- No config file loading or validation
- Basic TypeScript interfaces in `src/types.ts`

## Target State
- ArkType schemas with JSON schema generation
- Runtime config validation with proper error handling
- IDE support via JSON schema for `.stepdownrc.json`
- Backward compatibility maintained

## Implementation Steps

### 1. Dependencies & Setup
- [ ] Add `arktype` to dependencies: `bun add arktype`
- [ ] Create `src/config/` directory
- [ ] Verify ArkType installation and basic functionality

### 2. Refactor Types with ArkType (`src/types.ts`)
- [ ] Convert interfaces to ArkType schemas alongside existing types
- [ ] Create `ConfigSchema` using ArkType syntax
- [ ] Export both TypeScript types AND ArkType schemas
- [ ] Add JSON schema export using `ConfigSchema.toJsonSchema()`
- [ ] Maintain backward compatibility with existing interfaces

### 3. Create Config Schema (`src/config/schema.ts`)
- [ ] Define persistent config properties only (exclude runtime-only: `fix`, `json`, `outputFile`)
- [ ] Create separate schemas for file config vs full config
- [ ] Add detailed descriptions and validation rules
- [ ] Export both ArkType type and JSON schema

```typescript
// Example structure
export const FileConfigSchema = type({
  ignore: "string[].default([])",
  analyzeArrowFunctions: "boolean.default(true)",
  analyzeExportsOnly: "boolean.default(false)", 
  reportCircularDependencies: "boolean.default(true)"
}).describe("Stepdown rule file configuration")
```

### 4. Implement Config Loader (`src/config/loader.ts`)
- [ ] Create async `loadConfig(configPath?: string)` function
- [ ] Use `Bun.file()` to read config file with error handling
- [ ] Validate using ArkType schema with proper error reporting
- [ ] Merge file config with CLI options (CLI takes precedence)
- [ ] Handle missing files gracefully (use defaults)

### 5. Update CLI (`src/cli.ts`)
- [ ] Modify `createConfig()` to call config loader
- [ ] Add validation errors handling with user-friendly messages
- [ ] Maintain existing CLI option functionality
- [ ] Add `--config` validation to show schema errors

### 6. Build Integration
- [ ] Update `scripts/build.ts` to include schema file in build output
- [ ] Export JSON schema as part of package files
- [ ] Ensure schema is accessible for IDE validation

### 7. Documentation Updates
- [ ] Update README.md with `$schema` reference in config examples
- [ ] Add validation error examples
- [ ] Update config documentation

## File Structure Changes

```
src/
├── config/
│   ├── schema.ts      # ArkType schemas
│   └── loader.ts      # Config loading logic
├── types.ts           # Updated with ArkType schemas
└── cli.ts             # Updated to use config loader

dist/                  # Build output
stepdown-schema.json   # Generated JSON schema (root)
```

## Implementation Details

### Config Loading Flow
1. Check if config file exists using `Bun.file()`
2. Parse JSON with error handling
3. Validate against ArkType schema
4. Merge with CLI defaults
5. Return final validated config

### Error Handling Strategy
- **Malformed JSON**: Clear error message with line info
- **Schema validation**: Show ArkType error summary
- **Missing file**: Use defaults with info message
- **File permissions**: Clear permission error guidance

### Schema Generation
- Use `ConfigSchema.toJsonSchema()` for JSON schema
- Include schema in build output for IDE validation
- Reference in config files via `$schema` property

## Decisions Needed

### 1. Config File Scope
- **Option A**: Include runtime-only properties (`fix`, `json`, `outputFile`) in schema for completeness
- **Option B**: Keep runtime-only properties CLI-only (simpler file config)
- **Recommendation**: Option B - cleaner separation of concerns

### 2. Schema Location
- **Option A**: Put JSON schema in project root (`stepdown-schema.json`)
- **Option B**: Put in `dist/` directory after build
- **Recommendation**: Option A - easier for IDE discovery

### 3. Backward Compatibility
- **Option A**: Keep existing TypeScript interfaces permanently
- **Option B**: Phase out interfaces in favor of ArkType types
- **Recommendation**: Option A initially, consider Option B later

## Testing Strategy
- [ ] Test valid config file loading
- [ ] Test invalid config validation errors
- [ ] Test missing config file handling
- [ ] Test CLI option override behavior
- [ ] Test JSON schema generation and validation
- [ ] Test IDE integration with schema reference

## Success Criteria
1. ✅ Config files are validated at runtime with helpful error messages
2. ✅ IDE provides autocomplete/validation for `.stepdownrc.json` files  
3. ✅ Existing CLI functionality remains unchanged
4. ✅ JSON schema is included in build output
5. ✅ All existing tests continue to pass
6. ✅ New tests cover config loading/validation scenarios

## Risk Mitigation
- **Breaking changes**: Maintain backward compatibility by keeping existing interfaces
- **Performance impact**: Config loading is async and cached appropriately
- **Error clarity**: Use ArkType's detailed error reporting
- **Complexity**: Keep config logic isolated in `src/config/` module
