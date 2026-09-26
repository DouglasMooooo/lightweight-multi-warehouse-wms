import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const componentRoot = join(root, "components");
const files = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".tsx")) files.push(path);
  }
}
walk(componentRoot);

const obviousOperatorPhrases = [
  "Bulk SN", "Serial numbers",
  "Upload CSV/XLSX", "Validation", "Physical", "Registered",
  "Remaining Capacity", "Confirm registration", "Manual Review",
  "Previous", "Next", "Open transfers", "Counting",
];
const findings = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const phrase of obviousOperatorPhrases) {
    const literal = new RegExp(`>\\s*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*<`);
    if (literal.test(source))
      findings.push(`${relative(root, file)}: hard-coded operator phrase "${phrase}"`);
  }
}
if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Operator i18n check passed for ${files.length} React component files.`);
}
