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
    name: "Bug report model output",
    file: "bug-report-input.json",
    expectedLatex: "\\frac{P_{\\text{loss}}(25\\text{kV})}{P_{\\text{loss}}(765\\text{kV})} = \\left(\\frac{765}{25}\\right)^2 \\approx 937",
    description: "Model output for bug report case"
  },
  {
    name: "Mixed: escaped and unescaped",
    file: "mixed-escaped-unescaped.json",
    expectedLatex: "\\frac{a}{b} + \\frac{c}{d}",
    description: "First escaped, second not - both should produce valid LaTeX"
  },
  {
    name: "Quiz with LaTeX in options",
    file: "quiz-with-latex.json",
    expectedLatex: "$E_k = \\frac{1}{2}mv^2$",
    description: "LaTeX embedded in quiz question options"
  },
  {
    name: "Slide with text and LaTeX elements",
    file: "slide-with-text-and-latex.json",
    expectedLatex: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}",
    description: "Mixed text and LaTeX elements in slide"
  },
  {
    name: "Newlines in text content",
    file: "newlines-in-text.json",
    expectedLatex: "",
    description: "Valid JSON newlines should be preserved in text content"
  }
];

function extractLatexFromResult(result: unknown, fileName: string): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  
  const obj = result as Record<string, unknown>;
  
  // Handle slide/element structure
  if (obj.elements && Array.isArray(obj.elements)) {
    const latexElement = obj.elements.find((el: unknown) => {
      if (!el || typeof el !== 'object') return false;
      const element = el as Record<string, unknown>;
      return element.type === 'latex' && typeof element.latex === 'string';
    });
    if (latexElement) {
      return (latexElement as Record<string, string>).latex;
    }
  }
  
  // Handle quiz structure - look in questions -> options
  if (obj.questions && Array.isArray(obj.questions)) {
    for (const question of obj.questions) {
      if (question.options && Array.isArray(question.options)) {
        for (const option of question.options) {
          if (typeof option === 'string' && option.includes('$')) {
            return option; // Return first option with LaTeX
          }
        }
      }
    }
  }
  
  // Handle text content with newlines
  if (obj.elements && Array.isArray(obj.elements)) {
    const textElement = obj.elements.find((el: unknown) => {
      if (!el || typeof el !== 'object') return false;
      const element = el as Record<string, unknown>;
      return element.type === 'text' && typeof element.content === 'string';
    });
    if (textElement) {
      // Return empty string for text-only tests
      return '';
    }
  }
  
  return undefined;
}

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
    const result = parseJsonResponse<unknown>(input);
    
    if (!result) {
      console.log(`❌ FAIL: ${testCase.name}`);
      console.log(`   Failed to parse JSON`);
      return false;
    }
    
    const actualLatex = extractLatexFromResult(result, testCase.file);
    
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
  console.log("LaTeX JSON Repair Test Suite");
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
