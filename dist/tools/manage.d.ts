/**
 * list_cases and create_test_case MCP tool implementations.
 */
/**
 * list_cases — enumerate available fixtures with their step counts.
 */
export declare function listCasesTool(fixturesDir: string): string;
/**
 * create_test_case — create a new YAML fixture file.
 */
export declare function createTestCaseTool(name: string, steps: unknown[], fixturesDir: string): string;
