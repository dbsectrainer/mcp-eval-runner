/**
 * Shared fixture discovery and publishing for mcp-eval-runner.
 * Supports discovering fixtures across multiple directories and publishing
 * (copying) fixtures to a destination directory.
 */

import fs from "fs";
import path from "path";
import { loadFixturesFromDir } from "./fixture.js";

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
export function discoverFixtures(dirs: string[]): FixtureEntry[] {
  const seen = new Set<string>();
  const entries: FixtureEntry[] = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    const fixtures = loadFixturesFromDir(dir);

    for (const fixture of fixtures) {
      if (seen.has(fixture.name)) {
        continue;
      }
      seen.add(fixture.name);

      // Find the actual file path for this fixture
      const candidates = [
        path.join(dir, `${fixture.name}.yaml`),
        path.join(dir, `${fixture.name}.yml`),
        path.join(dir, `${fixture.name}.json`),
        // Also try the sanitized name
        path.join(dir, `${fixture.name.replace(/[^a-z0-9_-]/gi, "_")}.yaml`),
        path.join(dir, `${fixture.name.replace(/[^a-z0-9_-]/gi, "_")}.yml`),
        path.join(dir, `${fixture.name.replace(/[^a-z0-9_-]/gi, "_")}.json`),
      ];

      let filePath = dir;
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          filePath = candidate;
          break;
        }
      }

      entries.push({
        name: fixture.name,
        path: filePath,
        suite_count: 1, // Each fixture file is one suite
        case_count: fixture.steps.length,
      });
    }
  }

  return entries;
}

/**
 * Publish (copy) a fixture YAML/JSON file to the destination directory.
 * Creates the destination directory if it does not exist.
 *
 * @param fixture - The fixture object or a path to a fixture file
 * @param dest    - Destination directory path
 */
export function publishFixture(fixture: unknown, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });

  // If fixture is a string, treat it as a file path to copy
  if (typeof fixture === "string") {
    const srcPath = fixture;
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Fixture file not found: ${srcPath}`);
    }
    const fileName = path.basename(srcPath);
    const destPath = path.join(dest, fileName);
    fs.copyFileSync(srcPath, destPath);
    return;
  }

  // If fixture is an object, serialize it as YAML-like JSON and write
  if (typeof fixture === "object" && fixture !== null) {
    const obj = fixture as { name?: string };
    const name = obj.name ?? "fixture";
    const safeName = String(name).replace(/[^a-z0-9_-]/gi, "_");
    const destPath = path.join(dest, `${safeName}.json`);
    fs.writeFileSync(destPath, JSON.stringify(fixture, null, 2), "utf-8");
    return;
  }

  throw new Error(`Invalid fixture: expected a file path string or fixture object`);
}
