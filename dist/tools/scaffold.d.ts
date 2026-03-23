/**
 * scaffold_fixture tool implementation.
 *
 * Generates a boilerplate YAML fixture file given a name and a list of tool names.
 * Each tool name becomes a documented step with placeholder input and assertions.
 */
/**
 * Scaffold a YAML fixture file and write it to the fixtures directory.
 * Returns the path to the created file.
 */
export declare function scaffoldFixtureTool(name: string, toolNames: string[], fixturesDir: string): string;
