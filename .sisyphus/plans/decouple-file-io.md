# Refactor: Consolidate File Operations into Discrete Module with DIP

## TL;DR

> **Quick Summary**: Create a discrete `FileService` module that handles file discovery, filtering, and content parsing. Inject this module via Dependency Injection Principle in CLI to decouple file operations from business logic.

> **Deliverables**:
> - `src/services/FileService.ts` - consolidated file operations (discovery, filtering, reading)
> - Refactored `src/analyzer.ts` - pure analysis logic
> - Refactored `src/fixer.ts` - pure fixing logic  
> - Updated `src/cli.ts` - inject FileService via DIP
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - sequential
> **Critical Path**: Create FileService → Refactor analyzer → Refactor fixer → Update CLI

---

## Context

### Original Request
Refactor the analyzer and fixer to decouple file IO. User clarified: remove backward compatibility, consolidate file operations into discrete module, inject via DIP in CLI.

### Analysis Summary
**Current State**:
- `analyzer.ts` has glob and readFileSync embedded (lines 1-2, 26, 599)
- `fixer.ts` has fileProcessor with read/write (lines 245-256)
- `cli.ts` directly calls analyzeFiles/fixFiles without any abstraction

**Metis Review Insights Applied**:
- No backward compatibility needed
- Focus on clean separation via FileService module
- CLI becomes the composition root for DI

---

## Work Objectives

### Core Objective
Create a `FileService` module that encapsulates:
1. **File Discovery**: Using glob patterns
2. **File Filtering**: Using ignore patterns  
3. **Content Parsing**: Reading files and creating TypeScript SourceFile

This module is injected into analyzer/fixer via constructor or parameter injection.

### Concrete Deliverables
- `src/services/FileService.ts` - consolidated file operations with interface
- `src/services/types.ts` - FileService interface
- Refactored `src/analyzer.ts` - takes parsed content, not file paths
- Refactored `src/fixer.ts` - takes content, not file paths  
- Updated `src/cli.ts` - creates and injects FileService

### Must Have
- FileService interface defines contract
- CLI creates FileService instance
- Analyzer/Fixer receive FileService or parsed content
- Clean separation of concerns

### Must NOT Have (Guardrails)
- NO backward compatibility wrappers
- NO file operations in analyzer.ts or fixer.ts
- NO glob/readFileSync in pure logic files

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: bun test

### Agent-Executed QA Scenarios

```
Scenario: FileService resolves patterns correctly
  Tool: Bash
  Preconditions: FileService implemented
  Steps:
    1. Import FileService
    2. Call resolve(["**/*.ts"], [])
    3. Assert returns array of file paths
  Expected Result: Array of TypeScript files
```

---

## TODOs

- [x] 1. Verify baseline tests pass

  **What to do**:
  - Run `bun test` to establish baseline
  - Document current state

  **Must NOT do**:
  - Modify source code

  **Acceptance Criteria**:
  - [ ] All tests pass
  - [ ] Exit code 0

  **Commit**: NO

---

- [x] 2. Create FileService interface in src/services/types.ts

  **What to do**:
  - Create `src/services/types.ts`:
    ```typescript
    import type { SourceFile } from "typescript";

    export interface FileServiceOptions {
      ignore?: string[];
    }

    export interface ParsedFile {
      sourceFile: SourceFile;
      filePath: string;
      content: string;
    }

    export interface IFileService {
      resolveFiles(patterns: string[]): Promise<string[]>;
      parseFile(filePath: string): ParsedFile;
      parseContent(content: string, filePath: string): ParsedFile;
      writeFile(filePath: string, content: string): void;
      readFile(filePath: string): string;
    }
    ```

  **Must NOT do**:
  - Implement the interface yet

  **Acceptance Criteria**:
  - [ ] Interface defined
  - [ ] Exports correct types

  **Commit**: YES
  - Message: `refactor: add FileService interface types`
  - Files: `src/services/types.ts`

---

- [x] 3. Implement FileService in src/services/FileService.ts

  **What to do**:
  - Create `src/services/FileService.ts`:
    ```typescript
    import { glob } from "glob";
    import { readFileSync, writeFileSync } from "node:fs";
    import ts from "typescript";
    import type { IFileService, ParsedFile, FileServiceOptions } from "./types";

    export class FileService implements IFileService {
      private ignore: string[];

      constructor(options: FileServiceOptions = {}) {
        this.ignore = options.ignore ?? [];
      }

      async resolveFiles(patterns: string[]): Promise<string[]> {
        const allFiles: string[] = [];
        for (const pattern of patterns) {
          const matches = await glob(pattern, {
            ignore: ["node_modules/**", "dist/**", "coverage/**", "*.d.ts", ...this.ignore],
          });
          allFiles.push(...matches);
        }
        return [...new Set(allFiles)].sort((a, b) => a.localeCompare(b));
      }

      parseFile(filePath: string): ParsedFile {
        const content = this.readFile(filePath);
        return this.parseContent(content, filePath);
      }

      parseContent(content: string, filePath: string): ParsedFile {
        const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
        return { sourceFile, filePath, content };
      }

      readFile(filePath: string): string {
        return readFileSync(filePath, "utf-8");
      }

      writeFile(filePath: string, content: string): void {
        writeFileSync(filePath, content, "utf-8");
      }
    }
    ```

  **Must NOT do**:
  - Add business logic (analysis/fixing)

  **Acceptance Criteria**:
  - [ ] FileService implements IFileService
  - [ ] All methods work

  **Commit**: YES
  - Message: `refactor: implement FileService`
  - Files: `src/services/FileService.ts`

---

- [x] 4. Refactor analyzer.ts - use FileService for parsing

  **What to do**:
  - Remove imports: `readFileSync`, `glob`
  - Create `analyzeParsedFile(parsedFile: ParsedFile): AnalysisResult`
    - Takes ParsedFile (already has sourceFile)
    - Pure analysis logic
  - Update `analyzeFiles()` to:
    - Accept optional FileService parameter
    - Use FileService to get parsed files
    - Call `analyzeParsedFile()` for each

  **Must NOT do**:
  - Import node:fs or glob in this file

  **Acceptance Criteria**:
  - [ ] analyzeParsedFile exists
  - [ ] No node:fs imports
  - [ ] No glob imports

  **Commit**: YES
  - Message: `refactor(analyzer): decouple file parsing`
  - Files: `src/analyzer.ts`

---

- [x] 5. Refactor fixer.ts - use FileService for file operations

  **What to do**:
  - Remove imports: `readFileSync`, `writeFileSync`  
  - Create `fixParsedFile(parsedFile: ParsedFile, config: Config): FixResult`
    - Takes content directly
    - Pure fixing logic
  - Update `fixFiles()` to:
    - Accept optional FileService parameter
    - Use FileService to read/write files
    - Call `fixParsedFile()` for each

  **Must NOT do**:
  - Import node:fs in this file

  **Acceptance Criteria**:
  - [ ] fixParsedFile exists
  - [ ] No node:fs imports
  - [ ] No fileProcessor object

  **Commit**: YES
  - Message: `refactor(fixer): decouple file operations`
  - Files: `src/fixer.ts`

---

- [x] 6. Update CLI to inject FileService via DIP

  **What to do**:
  - Import FileService from `./services/FileService`
  - Create FileService instance in CLI action
  - Pass to analyzeFiles/fixFiles or call directly:
    ```typescript
    const fileService = new FileService({ ignore: config.ignore });
    const filePaths = await fileService.resolveFiles(patterns);
    
    for (const filePath of filePaths) {
      const parsedFile = fileService.parseFile(filePath);
      const result = analyzeParsedFile(parsedFile);
      // output result
    }
    ```

  **Must NOT do**:
  - Change output format

  **Acceptance Criteria**:
  - [ ] CLI creates FileService
  - [ ] Uses FileService for all file operations

  **Commit**: YES
  - Message: `refactor(cli): inject FileService via DIP`
  - Files: `src/cli.ts`

---

- [x] 7. Run tests and verify functionality

  **What to do**:
  - Run `bun test`
  - Verify all tests pass

  **Must NOT do**:
  - Skip tests

  **Acceptance Criteria**:
  - [ ] All tests pass
  - [ ] CLI works correctly

  **Commit**: YES (if needed)

---

## Success Criteria

### Final Checklist
- [x] FileService handles all file operations
- [x] analyzer.ts has no node:fs imports
- [x] fixer.ts has no node:fs imports
- [x] CLI injects FileService
- [x] All tests pass
