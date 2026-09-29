import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * The model is for reading receipts, and nothing else.
 *
 * Typing an expense, editing one, setting a budget, viewing the dashboard or
 * exporting to Excel are all ordinary code with no model in the loop - they
 * should cost nothing to run, work with no API key, and never wait on a network
 * call to a model. That is true today; these tests are what keep it true, by
 * failing the moment the model is wired into a second place.
 *
 * Each test names the single file allowed to do the thing. Reaching for the
 * model somewhere new means deliberately editing this list, rather than
 * discovering later that the dashboard quietly costs a cent to load.
 */

const SRC = path.join(process.cwd(), "src");

/** Every .ts/.tsx file under src/, as [repo-relative path, contents]. */
function sourceFiles(): [string, string][] {
  const found: [string, string][] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        found.push([path.relative(process.cwd(), full), fs.readFileSync(full, "utf8")]);
      }
    }
  }

  walk(SRC);
  return found;
}

const FILES = sourceFiles();

function filesMatching(pattern: RegExp): string[] {
  return FILES.filter(([, contents]) => pattern.test(contents))
    .map(([file]) => file)
    .sort();
}

test("only the extraction module talks to the Anthropic SDK", () => {
  assert.deepEqual(filesMatching(/@anthropic-ai\/sdk/), ["src/lib/extract.ts"]);
});

test("only the extraction module reads the API key", () => {
  assert.deepEqual(filesMatching(/ANTHROPIC_API_KEY/), ["src/lib/extract.ts"]);
});

test("only the extract route runs an extraction", () => {
  const callers = filesMatching(/\bextractReceipt\s*\(/).filter(
    (file) => file !== "src/lib/extract.ts",
  );
  assert.deepEqual(callers, ["src/app/api/extract/route.ts"]);
});

test("only the receipt scanner calls the extract endpoint", () => {
  const callers = filesMatching(/["'`]\/api\/extract/).filter(
    (file) => !file.startsWith("src/app/api/extract/"),
  );
  assert.deepEqual(callers, ["src/components/ReceiptCapture.tsx"]);
});

test("typing an expense by hand reaches no network at all", () => {
  // These are the whole manual path: the mode switcher, the empty-form wrapper,
  // and the shared form both routes confirm in. None of them may fetch; saving
  // goes through a server action, which is a function call, not a request they
  // compose themselves.
  for (const file of [
    "src/components/ManualExpense.tsx",
    "src/components/AddExpense.tsx",
    "src/components/ExpenseForm.tsx",
  ]) {
    const contents = FILES.find(([name]) => name === file)?.[1];
    assert.ok(contents, `${file} is missing - update this test if it moved`);
    assert.doesNotMatch(contents, /\bfetch\s*\(/, `${file} should not make requests`);
    assert.doesNotMatch(contents, /extractReceipt|@anthropic-ai/, `${file} should not use the model`);
  }
});

test("the pages that only read data never reach for the model", () => {
  // Dashboard, receipts, plan, and the Excel export. If any of these ever want
  // the model, that is a decision to make on purpose, not by accident.
  for (const file of [
    "src/app/page.tsx",
    "src/app/receipts/page.tsx",
    "src/app/plan/page.tsx",
    "src/app/api/export/route.ts",
    "src/app/actions.ts",
    "src/lib/aggregate.ts",
    "src/lib/excel.ts",
  ]) {
    const contents = FILES.find(([name]) => name === file)?.[1];
    assert.ok(contents, `${file} is missing - update this test if it moved`);
    assert.doesNotMatch(
      contents,
      /@anthropic-ai|extractReceipt|ANTHROPIC_API_KEY|\/api\/extract/,
      `${file} should work with no model and no API key`,
    );
  }
});
