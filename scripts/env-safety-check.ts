import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const envFiles = [".env", ".env.local", ".env.production", ".env.example"];
const requiredGitignorePatterns = [".env", ".env.local", ".env.production", "*.sqlite", "data/*.sqlite"];
const failures: string[] = [];

const gitignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8").split(/\r?\n/).map((line) => line.trim()) : [];

console.log(JSON.stringify({
  envFiles: Object.fromEntries(envFiles.map((file) => [file, existsSync(file)]))
}, null, 2));

for (const pattern of requiredGitignorePatterns) {
  if (!gitignore.includes(pattern)) failures.push(`gitignore_missing:${pattern}`);
}

if (existsSync(".env.example")) {
  const example = readFileSync(".env.example", "utf8");
  for (const key of ["BINANCE_API_KEY", "BINANCE_API_SECRET"]) {
    const value = valueForEnvKey(example, key);
    if (value !== undefined && realLookingSecret(value)) {
      failures.push(`env_example_contains_real_looking_${key}`);
    }
  }
}

const trackedFiles = gitTrackedFiles();
for (const file of trackedFiles) {
  const content = safeRead(file);
  if (content === undefined) continue;
  for (const key of ["BINANCE_API_KEY", "BINANCE_API_SECRET"]) {
    const matches = content.match(new RegExp(`^\\s*${key}=.*$`, "gm")) ?? [];
    for (const match of matches) {
      if (file === ".env.example" && placeholderLine(match)) continue;
      failures.push(`tracked_secret_assignment:${file}:${key}`);
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ result: "ENV_SAFETY_FAILED", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  result: "ENV_SAFETY_OK",
  gitignoreRequiredPatternsPresent: requiredGitignorePatterns,
  trackedSecretAssignmentsFound: false,
  secretsPrinted: false
}, null, 2));

function valueForEnvKey(content: string, key: string): string | undefined {
  const line = content.split(/\r?\n/).find((candidate) => candidate.trim().startsWith(`${key}=`));
  if (line === undefined) return undefined;
  return line.slice(line.indexOf("=") + 1).trim();
}

function realLookingSecret(value: string): boolean {
  if (value.length === 0) return false;
  if (/^<.*>$/.test(value)) return false;
  if (/^(changeme|placeholder|test|example)$/i.test(value)) return false;
  return value.length >= 16 && /^[A-Za-z0-9_\-]+$/.test(value);
}

function placeholderLine(line: string): boolean {
  const value = line.slice(line.indexOf("=") + 1).trim();
  return value.length === 0 || /^<.*>$/.test(value) || /placeholder|example|test/i.test(value);
}

function gitTrackedFiles(): string[] {
  try {
    return execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter((file) => file.length > 0);
  } catch {
    failures.push("git_ls_files_failed");
    return [];
  }
}

function safeRead(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}
