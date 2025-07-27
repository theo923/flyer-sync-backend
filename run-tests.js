#!/usr/bin/env node
/**
 * Test Runner for FlyerSync Backend
 * Runs all test files in the tests directory
 */

const { execSync } = require("child_process");
const { readdirSync } = require("fs");
const path = require("path");

console.log("🧪 FlyerSync Backend Test Runner");
console.log("================================\n");

const testsDir = path.join(__dirname, "tests");
const testFiles = readdirSync(testsDir)
  .filter((file) => file.startsWith("test-") && file.endsWith(".js"))
  .sort();

if (testFiles.length === 0) {
  console.log("❌ No test files found");
  process.exit(1);
}

console.log(`Found ${testFiles.length} test files:\n`);

for (const testFile of testFiles) {
  console.log(`🔍 Running ${testFile}...`);
  console.log("─".repeat(50));

  try {
    const testPath = path.join(testsDir, testFile);
    execSync(`node "${testPath}"`, {
      stdio: "inherit",
      cwd: __dirname,
    });
    console.log(`✅ ${testFile} completed\n`);
  } catch (error) {
    console.log(`❌ ${testFile} failed\n`);
  }
}

console.log("🎉 Test run completed!");
