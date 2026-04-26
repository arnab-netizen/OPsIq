import fs from "node:fs";
import path from "node:path";

const required = [
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  "prisma/schema.prisma",
  "src/lib/api-handler.ts",
  "src/lib/auth-guard.ts",
  "src/lib/visibility.ts",
  "src/lib/validation.ts",
  "src/lib/db.ts",
  "src/services/recommendation.ts",
  "src/services/business-condition.ts",
];

const missing = required.filter((file) => !fs.existsSync(path.join(process.cwd(), file)));
if (missing.length) {
  console.error("OPSIQ V2 repo check failed. Missing required files:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const problems = [];
if (!pkg.dependencies?.next) problems.push("Next dependency not found");
if (!pkg.dependencies?.["@prisma/client"]) problems.push("@prisma/client dependency not found");
if (!pkg.devDependencies?.vitest) problems.push("vitest dev dependency not found");
const tsconfig = fs.readFileSync("tsconfig.json", "utf8");
if (!tsconfig.includes('"@/*"')) problems.push("Expected @/* TypeScript alias not found");

if (problems.length) {
  console.error("OPSIQ V2 repo check warning/failure:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("OPSIQ V2 repo check passed: Next + Prisma + Vitest + @ alias structure detected.");
