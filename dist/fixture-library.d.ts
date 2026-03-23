/**
 * Shared fixture discovery and publishing for mcp-eval-runner.
 * Supports discovering fixtures across multiple directories and publishing
 * (copying) fixtures to a destination directory.
 */
export interface FixtureEntry {
    name: string;
    path: string;
    suite_count: number;
    case_count: number;
}
/**
 * Discover all fixture files across the given directories.
 * Returns a deduplicated list (by name, first occurrence wins).
 *
 * @param dirs - Array of directory paths to scan for fixtures
 */
export declare function discoverFixtures(dirs: string[]): FixtureEntry[];
/**
 * Publish (copy) a fixture YAML/JSON file to the destination directory.
 * Creates the destination directory if it does not exist.
 *
 * @param fixture - The fixture object or a path to a fixture file
 * @param dest    - Destination directory path
 */
export declare function publishFixture(fixture: unknown, dest: string): void;
