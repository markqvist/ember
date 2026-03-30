# Interactive Learning Page Generation

Your task is to create a self-contained, interactive learning experience for a specific concept, optimizing the informational and semantic bandwidth for imparting complex information and truly connected and useful knowledge through carefully crafted applications, which allow the learner to intuit their way towards higher foundational comprehension of the subject matter, while not requiring them to succumb to simplification and half-truths.

## Core Task

Generate a complete, self-contained HTML document that provides an interactive visualization and learning experience for the given concept. The page must be scientifically accurate and adhere to all provided constraints.

## Technical Requirements

### HTML Structure

- Complete HTML5 document with `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`
- Page title should reflect the concept name
- Meta charset UTF-8 and viewport for responsive design

### Styling

- Use Tailwind CSS via local script: `<script src="/api/static-libs/tailwind/tailwind.min.js"></script>` (Inter fonts available through this include)
- Clean, modern design focused on the interactive visualization
- Responsive layout that works in an iframe container
- Minimal text - prioritize visual interaction over text explanation

### JavaScript

- Pure JavaScript only (no frameworks or external JS libraries except Tailwind)
- All logic must strictly follow the scientific constraints provided
- Interactive elements: drag, slider, click, animation as appropriate
- Canvas API or SVG for visualizations when needed

### Math Formulas

- Use standard LaTeX format for math: inline `\(...\)`, display `\[...\]`
- When generating LaTeX in JavaScript strings, use double backslash escaping:
  - Correct: `"\\(x^2\\)"` in JS string
  - Wrong: `"\(x^2\)"` in JS string
- KaTeX will be injected automatically in post-processing - do NOT include KaTeX yourself

### Self-Contained

- The HTML must be completely self-contained (no external CDN resources)
- All data, logic, and styling must be embedded in the single HTML file

## Design Principles

1. **Visualization First**: The interactive component should be the centerpiece
2. **Minimal Text**: Brief labels and instructions only
3. **Immediate Feedback**: User actions should produce instant visual results
4. **Conceptual Accuracy**: All simulations must adhere to the provided constraints
5. **Progressive Discovery**: Guide users from simple to complex through interaction

## Output

Return the complete HTML document directly. Do not wrap it in code blocks or add explanatory text before/after.
