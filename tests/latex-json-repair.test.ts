/**
 * LaTeX JSON Repair Test Suite
 * 
 * Tests the json-repair.ts module's handling of LaTeX escape sequences
 * in AI-generated model outputs.
 * 
 * CRITICAL: Test inputs use String.raw to prevent JavaScript from interpreting
 * escape sequences like \f, \t, \n before they reach the parser.
 */

import { parseJsonResponse, tryParseJson } from '../lib/generation/json-repair';

// Test case structure
interface TestCase {
  name: string;
  input: string;
  expectedLatex?: string;
  shouldParse: boolean;
  description?: string;
}

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  input: string;
  output?: string;
  parsedLatex?: string;
  error?: string;
}

// Helper to create raw strings without JavaScript escape interpretation
const raw = String.raw;

// Comprehensive test cases covering all scenarios
const testCases: TestCase[] = [
  // === CORRECTLY ESCAPED INPUTS (should remain intact) ===
  {
    name: "Correctly escaped: simple fraction",
    input: raw`{"elements": [{"type": "latex", "latex": "\\frac{a}{b}"}]}`,
    expectedLatex: "\\frac{a}{b}",
    shouldParse: true,
    description: "Model correctly double-escaped backslash, should parse to single backslash in output"
  },
  {
    name: "Correctly escaped: quadratic formula",
    input: raw`{"elements": [{"type": "latex", "latex": "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"}]}`,
    expectedLatex: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}",
    shouldParse: true,
    description: "Complex formula with correct escaping"
  },
  {
    name: "Correctly escaped: text command",
    input: raw`{"elements": [{"type": "latex", "latex": "P_{\\text{loss}}"}]}`,
    expectedLatex: "P_{\\text{loss}}",
    shouldParse: true,
    description: "\\text command correctly escaped"
  },
  {
    name: "Correctly escaped: left/right delimiters",
    input: raw`{"elements": [{"type": "latex", "latex": "\\left(\\frac{765}{25}\\right)^2"}]}`,
    expectedLatex: "\\left(\\frac{765}{25}\\right)^2",
    shouldParse: true,
    description: "\\left and \\right commands correctly escaped"
  },
  {
    name: "Correctly escaped: multiple commands",
    input: raw`{"elements": [{"type": "latex", "latex": "\\frac{P_{\\text{loss}}(25\\text{kV})}{P_{\\text{loss}}(765\\text{kV})} = \\left(\\frac{765}{25}\\right)^2 \\approx 937"}]}`,
    expectedLatex: "\\frac{P_{\\text{loss}}(25\\text{kV})}{P_{\\text{loss}}(765\\text{kV})} = \\left(\\frac{765}{25}\\right)^2 \\approx 937",
    shouldParse: true,
    description: "Full complex formula from user's bug report - correctly escaped version"
  },

  // === INCORRECTLY ESCAPED INPUTS (need repair) ===
  {
    name: "Incorrect: unescaped fraction",
    input: raw`{"elements": [{"type": "latex", "latex": "\frac{a}{b}"}]}`,
    expectedLatex: "\\frac{a}{b}",
    shouldParse: true,
    description: "Model forgot to escape - \\f should be repaired to not be interpreted as form feed"
  },
  {
    name: "Incorrect: unescaped text command",
    input: raw`{"elements": [{"type": "latex", "latex": "P_{\text{loss}}"}]}`,
    expectedLatex: "P_{\\text{loss}}",
    shouldParse: true,
    description: "\\t should be repaired to not be interpreted as tab character"
  },
  {
    name: "Incorrect: unescaped sqrt",
    input: raw`{"elements": [{"type": "latex", "latex": "\sqrt{x}"}]}`,
    expectedLatex: "\\sqrt{x}",
    shouldParse: true,
    description: "\\s is not a special escape, but \\sqrt is valid LaTeX"
  },
  {
    name: "Incorrect: user's exact bug report",
    input: raw`{"elements": [{"type": "latex", "latex": "\rac{P_{\ ext{loss}}(25\ ext{kV})}{P_{\ ext{loss}}(765\ ext{kV})} = \left(\rac{765}{25}\right)^2 \approx 937"}]}`,
    expectedLatex: "\\frac{P_{\\text{loss}}(25\\text{kV})}{P_{\\text{loss}}(765\\text{kV})} = \\left(\\frac{765}{25}\\right)^2 \\approx 937",
    shouldParse: true,
    description: "The actual corrupted output from bug report - \\f consumed as form feed, \\t as tab"
  },

  // === MIXED INPUTS (some escaped, some not) ===
  {
    name: "Mixed: some escaped, some not",
    input: raw`{"elements": [{"type": "latex", "latex": "\\frac{a}{b} + \frac{c}{d}"}]}`,
    expectedLatex: "\\frac{a}{b} + \\frac{c}{d}",
    shouldParse: true,
    description: "First fraction escaped, second not - both should result in valid LaTeX"
  },
  {
    name: "Mixed: text command partially escaped",
    input: raw`{"elements": [{"type": "latex", "latex": "P_{\\text{loss}} + Q_{\text{gain}}"}]}`,
    expectedLatex: "P_{\\text{loss}} + Q_{\\text{gain}}",
    shouldParse: true,
    description: "One text command escaped, one not"
  },

  // === EDGE CASES ===
  {
    name: "Edge: empty latex string",
    input: raw`{"elements": [{"type": "latex", "latex": ""}]}`,
    expectedLatex: "",
    shouldParse: true,
    description: "Empty string should remain empty"
  },
  {
    name: "Edge: latex with no backslashes",
    input: raw`{"elements": [{"type": "latex", "latex": "E = mc^2"}]}`,
    expectedLatex: "E = mc^2",
    shouldParse: true,
    description: "Simple formula without LaTeX commands"
  },
  {
    name: "Edge: already double-escaped backslash",
    input: raw`{"elements": [{"type": "latex", "latex": "\\\\frac{a}{b}"}]}`,
    expectedLatex: "\\\\frac{a}{b}",
    shouldParse: true,
    description: "Four backslashes should become two in the parsed output"
  },
  {
    name: "Edge: backslash at end of string",
    input: raw`{"elements": [{"type": "latex", "latex": "\\frac{a}{b}\\"}]}`,
    expectedLatex: "\\frac{a}{b}",
    shouldParse: true,
    description: "Trailing backslash - should be handled gracefully"
  },
  {
    name: "Edge: unicode and special characters",
    input: raw`{"elements": [{"type": "latex", "latex": "\\alpha + \\beta = \\gamma \u00B0"}]}`,
    expectedLatex: "\\alpha + \\beta = \\gamma °",
    shouldParse: true,
    description: "Unicode escape sequence in JSON"
  },

  // === VALID JSON ESCAPES (should NOT be touched) ===
  {
    name: "Valid JSON: newline in text",
    input: raw`{"elements": [{"type": "text", "content": "Line 1\nLine 2"}]}`,
    expectedLatex: undefined,
    shouldParse: true,
    description: "\\n is valid JSON escape and should remain as newline"
  },
  {
    name: "Valid JSON: tab in text",
    input: raw`{"elements": [{"type": "text", "content": "Col1\tCol2"}]}`,
    expectedLatex: undefined,
    shouldParse: true,
    description: "\\t in non-latex field should remain as tab"
  },
  {
    name: "Valid JSON: quote escaping",
    input: raw`{"elements": [{"type": "text", "content": "He said \"hello\""}]}`,
    expectedLatex: undefined,
    shouldParse: true,
    description: "Escaped quotes should work correctly"
  },

  // === COMPLEX NESTED STRUCTURES ===
  {
    name: "Complex: multiple elements with mixed escaping",
    input: raw`{
      "elements": [
        {"type": "text", "content": "Formula:"},
        {"type": "latex", "latex": "\\frac{P_{\\text{loss}}}{P_{\text{gain}}} = \left(\frac{V_1}{V_2}\right)^2"},
        {"type": "text", "content": "End"}
      ]
    }`,
    expectedLatex: "\\frac{P_{\\text{loss}}}{P_{\\text{gain}}} = \\left(\\frac{V_1}{V_2}\\right)^2",
    shouldParse: true,
    description: "Multiple elements with different escaping levels"
  },

  // === STRESS TESTS ===
  {
    name: "Stress: many backslashes",
    input: raw`{"elements": [{"type": "latex", "latex": "\\\\\\\\frac{a}{b}"}]}`,
    expectedLatex: "\\\\\\\\frac{a}{b}",
    shouldParse: true,
    description: "Eight backslashes - should become four in output"
  },
  {
    name: "Stress: long formula with many commands",
    input: raw`{"elements": [{"type": "latex", "latex": "\\int_{0}^{\\infty} \\frac{\\sin(x)}{x} dx = \\frac{\\pi}{2} = \\sum_{n=0}^{\\infty} \frac{(-1)^n}{(2n+1)}"}]}`,
    expectedLatex: "\\int_{0}^{\\infty} \\frac{\\sin(x)}{x} dx = \\frac{\\pi}{2} = \\sum_{n=0}^{\\infty} \\frac{(-1)^n}{(2n+1)}",
    shouldParse: true,
    description: "Long formula with integral, fraction, sum - mixed escaping"
  }
];

// Run a single test case
function runTest(testCase: TestCase): TestResult {
  try {
    const result = parseJsonResponse<{
      elements?: Array<{ type: string; latex?: string; content?: string }>;
    }>(testCase.input);

    if (!result && testCase.shouldParse) {
      return {
        name: testCase.name,
        passed: false,
        input: testCase.input,
        error: "Failed to parse when parsing was expected"
      };
    }

    if (result && !testCase.shouldParse) {
      return {
        name: testCase.name,
        passed: false,
        input: testCase.input,
        output: JSON.stringify(result, null, 2),
        error: "Parsed successfully when failure was expected"
      };
    }

    // Check LaTeX content if expected
    if (testCase.expectedLatex !== undefined && result) {
      const latexElement = result.elements?.find(el => el.type === 'latex');
      const actualLatex = latexElement?.latex;

      if (actualLatex !== testCase.expectedLatex) {
        return {
          name: testCase.name,
          passed: false,
          input: testCase.input,
          parsedLatex: actualLatex,
          error: `LaTeX mismatch.\nExpected: ${JSON.stringify(testCase.expectedLatex)}\nActual: ${JSON.stringify(actualLatex)}`
        };
      }
    }

    return {
      name: testCase.name,
      passed: true,
      input: testCase.input,
      output: result ? JSON.stringify(result, null, 2).substring(0, 500) : undefined
    };

  } catch (error) {
    return {
      name: testCase.name,
      passed: !testCase.shouldParse,
      input: testCase.input,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Run all tests and report results
function runAllTests(): void {
  console.log("=".repeat(80));
  console.log("LaTeX JSON Repair Test Suite");
  console.log("=".repeat(80));
  console.log();

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = runTest(testCase);
    results.push(result);

    if (result.passed) {
      passed++;
      console.log(`✅ PASS: ${testCase.name}`);
    } else {
      failed++;
      console.log(`❌ FAIL: ${testCase.name}`);
      if (testCase.description) {
        console.log(`   Description: ${testCase.description}`);
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      console.log(`   Input: ${result.input.substring(0, 200)}${result.input.length > 200 ? '...' : ''}`);
      console.log();
    }
  }

  console.log("=".repeat(80));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${testCases.length} total`);
  console.log("=".repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

// Run the tests
runAllTests();
