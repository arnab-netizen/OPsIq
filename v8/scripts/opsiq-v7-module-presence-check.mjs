import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const repoRoot = process.cwd();
const modulesRoot = join(repoRoot, 'src', 'modules');
const catalogPath = join(modulesRoot, 'module-readiness', 'module-catalog.ts');
if (!existsSync(catalogPath)) { console.error('Missing module catalog:', catalogPath); process.exit(1); }
const catalogText = readFileSync(catalogPath, 'utf8');
const matches = [...catalogText.matchAll(/"key": "([^"]+)"/g)].map((match) => match[1]);
const unique = new Set(matches);
if (unique.size !== 45) { console.error(`Expected 45 modules in catalog, found ${unique.size}.`); process.exit(1); }
const missing = [];
for (const key of unique) { const moduleDir = join(modulesRoot, key); if (!existsSync(moduleDir)) missing.push(`${key}: missing directory`); if (!existsSync(join(moduleDir, `${key}.contract.ts`))) missing.push(`${key}: missing contract`); if (!existsSync(join(moduleDir, `${key}.ports.ts`))) missing.push(`${key}: missing ports`); if (!existsSync(join(moduleDir, 'README.md'))) missing.push(`${key}: missing README`); if (!existsSync(join(moduleDir, 'IMPLEMENTATION_PROMPT.md'))) missing.push(`${key}: missing implementation prompt`); }
if (missing.length > 0) { console.error('Module presence check failed:'); for (const item of missing) console.error(`- ${item}`); process.exit(1); }
const moduleDirs = readdirSync(modulesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
console.log(`OPSIQ V7 module presence check passed. Catalog modules: ${unique.size}. Module directories including module-readiness: ${moduleDirs.length}.`);
