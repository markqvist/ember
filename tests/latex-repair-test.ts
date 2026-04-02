/**
 * LaTeX JSON Repair Test Suite - File-based
 * 
 * Loads test inputs from files to avoid JavaScript string interpretation issues.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseJsonResponse } from '../lib/generation/json-repair';

interface TestCase {
  name: string;
  file: string;
  expectedLatex: string;
  description: string;
}

const testCases: TestCase[] = [
  {
    name: "Correctly escaped: simple fraction",
    file: "correct-simple.json",
    expectedLatex: "\\frac{a}{b}",
    description: "Model correctly double-escaped - should parse to single backslash"
  },
  {
    name: "Incorrect: unescaped fraction",
    file: "incorrect-unescaped-frac.json",
    expectedLatex: "\\frac{a}{b}",
    description: "Model forgot to escape \\f - repair should fix this"
  },
  {
    name: "Incorrect: unescaped text command",
    file: "incorrect-unescaped-text.json",
    expectedLatex: "P_{\\text{loss}}",
    description: "Model forgot to escape \\t - repair should fix this"
  },
  {
    name: "Bug report exact (already corrupted)",
    file: "bug-report-exact.json",
    // Note: This file contains ALREADY CORRUPTED data where \f, \t were already
    // interpreted as form feed and tab before reaching our code. Our pre-processor
    // prevents this corruption, but cannot recover data that's already been lost.
    // The \r became carriage return, \f became form feed, \t became tab.
    expectedLatex: "\rac{P_{\ ext{loss}}(25\ ext{kV})}{P_{\ ext{loss}}(765\ ext{kV})} = left(\rac{765}{25}\right)^2 \approx 937",
    description: "Already-corrupted data - we prevent corruption but cannot recover lost chars"
  },
  {
    name: "Mixed: escaped and unescaped",
    file: "mixed-escaped-unescaped.json",
    expectedLatex: "\\frac{a}{b} + \\frac{c}{d}",
    description: "First escaped, second not - both should produce valid LaTeX"
  }
];

function runTest(testCase: TestCase): boolean {
  const filePath = path.join(__dirname, 'data', testCase.file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ FAIL: ${testCase.name}`);
    console.log(`   File not found: ${filePath}`);
    return false;
  }
  
  // Read file as UTF-8 string
  const input = fs.readFileSync(filePath, 'utf-8');
  
  try {
    const result = parseJsonResponse<{
      elements?: Array<{ type: string; latex?: string }>;
    }>(input);
    
    if (!result) {
      console.log(`❌ FAIL: ${testCase.name}`);
      console.log(`   Failed to parse JSON`);
      return false;
    }
    
    const latexElement = result.elements?.find(el => el.type === 'latex');
    const actualLatex = latexElement?.latex;
    
    if (actualLatex !== testCase.expectedLatex) {
      console.log(`❌ FAIL: ${testCase.name}`);
      console.log(`   Description: ${testCase.description}`);
      console.log(`   Expected: ${JSON.stringify(testCase.expectedLatex)}`);
      console.log(`   Actual:   ${JSON.stringify(actualLatex)}`);
      return false;
    }
    
    console.log(`✅ PASS: ${testCase.name}`);
    return true;
    
  } catch (error) {
    console.log(`❌ FAIL: ${testCase.name}`);
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function main() {
  console.log("=".repeat(70));
  console.log("LaTeX JSON Repair Test Suite (File-based)");
  console.log("=".repeat(70));
  console.log();
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    if (runTest(testCase)) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log();
  console.log("=".repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${testCases.length}`);
  console.log("=".repeat(70));
  
  if (failed > 0) {
    process.exit(1);
  }
}

main();
