# Static Libraries Preparation

This directory contains scripts for preparing static JavaScript/CSS libraries for offline use in Ember's interactive simulations.

## prepare-static-libs.js

This script copies required libraries from `node_modules` to `public/static-libs/` for offline usage in interactive HTML simulations.

### What it does

1. **Copies KaTeX** from `node_modules/katex/dist/` including fonts and auto-render
2. **Downloads Tailwind CSS** standalone browser build from CDN (v3.4.17)
3. **Optionally copies D3.js** if installed (`node_modules/d3/dist/`)
4. **Generates a manifest** (`manifest.json`) with library versions and usage examples

### When to run

- **Automatically**: Runs during `pnpm build` (via the build script in package.json)
- **Manually**: Run `pnpm prepare-static-libs` after installing new library versions

### Adding new libraries

To add a new library:

1. Install it: `pnpm add <library>`
2. Add to `LIBRARIES` array in `prepare-static-libs.js`:
   ```javascript
   {
     name: 'library-name',
     sourceDir: 'node_modules/library-name/dist',
     files: ['library.min.js', 'library.min.css'],
     subdirs: ['assets', 'fonts'], // Optional
     optional: true, // Set to true if not required
   }
   ```
3. Update `ALLOWED_LIBRARIES` in `app/api/static-libs/[lib]/[...path]/route.ts`
4. Run `pnpm prepare-static-libs`

### API Endpoint

Libraries are served via `/api/static-libs/[lib]/[...path]`:

- Tailwind: `/api/static-libs/tailwind/tailwind.min.js`
- KaTeX CSS: `/api/static-libs/katex/katex.min.css`
- KaTeX JS: `/api/static-libs/katex/katex.min.js`
- KaTeX Auto-render: `/api/static-libs/katex/contrib/auto-render.min.js`
- KaTeX Fonts: `/api/static-libs/katex/fonts/KaTeX_Main-Regular.ttf`
- D3: `/api/static-libs/d3/d3.min.js` (if installed)

### Caching

All library files are served with `Cache-Control: public, max-age=31536000, immutable` headers, meaning browsers will cache them for one year. Since files are versioned by their content hash in the URL (or by library version), this is safe.

### Security

- Path traversal is prevented (no `..` allowed in paths)
- Only whitelisted libraries can be accessed
- Files are verified to stay within their library directory
- Maximum file size limit (10MB)
