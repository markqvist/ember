/**
 * Verify test input files have correct byte sequences
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestFile {
  name: string;
  file: string;
  expectedBytes: number[];
  description: string;
}

const testFiles: TestFile[] = [
  {
    name: "Correctly escaped: simple fraction",
    file: "correct-simple.json",
    expectedBytes: [0x5c, 0x5c, 0x66], // \\f
    description: "Should have double backslash before 'f'"
  },
  {
    name: "Incorrect: unescaped fraction", 
    file: "incorrect-unescaped-frac.json",
    expectedBytes: [0x5c, 0x66], // \f
    description: "Should have single backslash before 'f' (will become form feed)"
  },
  {
    name: "Incorrect: unescaped text command",
    file: "incorrect-unescaped-text.json", 
    expectedBytes: [0x5c, 0x74], // \t
    description: "Should have single backslash before 't' (will become tab)"
  },
  {
    name: "Bug report exact",
    file: "bug-report-exact.json",
    expectedBytes: [0x5c, 0x72], // \r
    description: "Should have single backslash before 'r' (carriage return)"
  },
  {
    name: "Mixed escaped and unescaped",
    file: "mixed-escaped-unescaped.json",
    expectedBytes: [0x5c, 0x5c, 0x66, 0x72, 0x61, 0x63, 0x7b, 0x61, 0x7d, 0x7b, 0x62, 0x7d, 0x20, 0x2b, 0x20, 0x5c, 0x66], // \\frac{a}{b} + \f
    description: "Should have \\frac then later \f"
  }
];

function verifyFile(testFile: TestFile): boolean {
  const filePath = path.join(__dirname, 'data', testFile.file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ FAIL: ${testFile.name}`);
    console.log(`   File not found: ${filePath}`);
    return false;
  }
  
  const content = fs.readFileSync(filePath);
  
  // Find the expected byte sequence in the file
  const expectedBuffer = Buffer.from(testFile.expectedBytes);
  const found = content.indexOf(expectedBuffer) !== -1;
  
  if (!found) {
    console.log(`❌ FAIL: ${testFile.name}`);
    console.log(`   Expected bytes: ${testFile.expectedBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    console.log(`   Description: ${testFile.description}`);
    
    // Show actual bytes around latex field
    const latexIdx = content.indexOf('"latex":');
    if (latexIdx !== -1) {
      const start = latexIdx + 9; // After "latex": "
      const end = Math.min(start + 50, content.length);
      const actualBytes = content.slice(start, end);
      console.log(`   Actual bytes at latex field: ${actualBytes.toString('hex').match(/.{1,2}/g)?.join(' ')}`);
    }
    return false;
  }
  
  console.log(`✅ PASS: ${testFile.name}`);
  console.log(`   Found expected bytes: ${testFile.expectedBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  return true;
}

function main() {
  console.log("=".repeat(60));
  console.log("Test Input Verification");
  console.log("=".repeat(60));
  console.log();
  
  let passed = 0;
  let failed = 0;
  
  for (const testFile of testFiles) {
    if (verifyFile(testFile)) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log();
  console.log("=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));
  
  if (failed > 0) {
    process.exit(1);
  }
}

main();
