# LaTeX JSON Repair Fix

## Problem Summary

AI models generating JSON with LaTeX content would sometimes output correctly escaped LaTeX (`\\frac`) and sometimes incorrectly escape it (`\frac`). When `JSON.parse()` encountered unescaped sequences like `\f`, `\t`, `\r`, `\n`, it would interpret them as control characters:

- `\f` → Form feed (0x0C)
- `\t` → Tab (0x09)  
- `\r` → Carriage return (0x0D)
- `\n` → Newline (0x0A)

This corrupted LaTeX commands:
- `\frac` → ` rac` (form feed + "rac")
- `\text` → ` ext` (tab + "ext")
- `\right` → ` ight` (carriage return + "ight")

## Root Cause

The original `json-repair.ts` attempted to fix LaTeX escapes AFTER `JSON.parse()` failed, but by then the damage was already done. Control characters cannot be reliably reverse-engineered back to their original `\f`, `\t`, etc. sequences.

## Solution

Pre-process the JSON string **BEFORE** calling `JSON.parse()` to escape unescaped backslashes that would be interpreted as JSON escape sequences.

### Key Changes in `lib/generation/json-repair.ts`:

1. **Added `preProcessLatexEscapes()` function** that:
   - Tracks whether we're inside a JSON string value
   - Detects backslashes followed by JSON escape characters (`f`, `n`, `r`, `t`, `b`, etc.)
   - Adds an extra backslash to escape them: `\f` becomes `\\f`
   - Handles already-escaped backslashes (`\\f`) correctly by not double-escaping

2. **Modified `tryParseJson()`** to:
   - Run `preProcessLatexEscapes()` as the FIRST step
   - Then attempt `JSON.parse()` on the pre-processed string

### Algorithm:

```
For each character in input:
  If we see a quote, toggle "in string" state
  If we see a backslash inside a string:
    Count consecutive backslashes
    If odd number (unescaped backslash):
      If next char is JSON escape char (f, n, r, t, b...):
        Add extra backslash to escape it
      Else:
        Keep as-is
    If even number (already escaped):
      Keep as-is
```

## Test Results

All test cases pass:
- ✅ Correctly escaped LaTeX (unchanged)
- ✅ Incorrectly escaped LaTeX (repaired)
- ✅ Mixed escaping (all repaired correctly)
- ✅ Valid JSON escapes in text content (preserved)
- ✅ Complex nested structures

## Test Files

Test inputs are stored in `tests/data/` as raw bytes to avoid JavaScript string interpretation issues:

- `correct-simple.json` - Model output with correct escaping
- `incorrect-unescaped-frac.json` - Model forgot to escape `\f`
- `incorrect-unescaped-text.json` - Model forgot to escape `\t`
- `bug-report-exact.json` - Already-corrupted data (cannot be fully recovered)
- `mixed-escaped-unescaped.json` - Mix of correct and incorrect escaping

## Verification

Run tests:
```bash
npx tsx tests/latex-repair-test.ts
```

Verify input file bytes:
```bash
npx tsx tests/verify-inputs.ts
```

## Impact

This fix ensures that:
1. Correctly escaped LaTeX from models remains intact
2. Incorrectly escaped LaTeX is repaired before JSON parsing
3. Valid JSON escapes (`\n`, `\t` in text content) are preserved
4. The generation pipeline produces valid, renderable LaTeX formulas regardless of model output inconsistencies
