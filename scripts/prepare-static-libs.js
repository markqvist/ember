/**
 * Prepare Static Libraries for Interactive Simulations
 *
 * This script copies required libraries from node_modules to public/static-libs
 * for offline usage in interactive HTML simulations.
 *
 * Run during build: node scripts/prepare-static-libs.js
 */

const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = process.cwd();
const PUBLIC_LIBS_DIR = path.join(ROOT_DIR, 'public', 'static-libs');

const LIBRARIES = [
  {
    name: 'katex',
    sourceDir: 'node_modules/katex/dist',
    files: ['katex.min.css', 'katex.min.js'],
    subdirs: ['contrib/auto-render.min.js', 'fonts'],
  },
  {
    name: 'd3',
    sourceDir: 'node_modules/d3/dist',
    files: ['d3.min.js'],
    optional: true,
  },
];

const TAILWIND_URL = 'https://cdn.tailwindcss.com/3.4.17';

async function ensureDir(dir) {
  await fsPromises.mkdir(dir, { recursive: true });
}

async function copyFile(src, dest) {
  await fsPromises.copyFile(src, dest);
}

async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fsPromises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fsPromises.unlink(dest).catch(() => {});
        reject(err);
      });
  });
}

async function prepareLibrary(lib) {
  const targetDir = path.join(PUBLIC_LIBS_DIR, lib.name);
  await ensureDir(targetDir);

  console.log(`Preparing ${lib.name}...`);

  const fullSourceDir = path.join(ROOT_DIR, lib.sourceDir);
  try {
    await fsPromises.access(fullSourceDir);
  } catch {
    if (lib.optional) {
      console.log(`  ⏭ Skipped (optional, not installed)`);
      return false;
    }
    throw new Error(`Source directory not found: ${lib.sourceDir}`);
  }

  for (const file of lib.files) {
    const srcPath = path.join(fullSourceDir, file);
    const destPath = path.join(targetDir, path.basename(file));

    try {
      await copyFile(srcPath, destPath);
      console.log(`  ✓ ${file}`);
    } catch (error) {
      console.error(`  ✗ Failed to copy ${file}: ${error}`);
      if (!lib.optional) throw error;
    }
  }

  if (lib.subdirs) {
    for (const subdir of lib.subdirs) {
      const srcPath = path.join(fullSourceDir, subdir);
      const destPath = path.join(targetDir, subdir);

      try {
        const stat = await fsPromises.stat(srcPath);
        if (stat.isDirectory()) {
          await copyDir(srcPath, destPath);
          console.log(`  ✓ ${subdir}/`);
        } else {
          // It's a file, ensure parent directory exists and copy
          await ensureDir(path.dirname(destPath));
          await copyFile(srcPath, destPath);
          console.log(`  ✓ ${subdir}`);
        }
      } catch (error) {
        console.error(`  ✗ Failed to copy ${subdir}: ${error}`);
        if (!lib.optional) throw error;
      }
    }
  }

  return true;
}

async function prepareTailwind() {
  const targetDir = path.join(PUBLIC_LIBS_DIR, 'tailwind');
  await ensureDir(targetDir);

  console.log('Preparing tailwind...');

  const destPath = path.join(targetDir, 'tailwind.min.js');

  try {
    await downloadFile(TAILWIND_URL, destPath);
    console.log('  ✓ tailwind.min.js (downloaded from CDN)');
  } catch (error) {
    console.error('  ✗ Failed to download Tailwind:', error);
    throw error;
  }
}

async function generateManifest(preparedLibs) {
  const manifest = {
    generated: new Date().toISOString(),
    libraries: {},
    usage: {
      tailwind: '<script src="/api/static-libs/tailwind/tailwind.min.js"></script>',
      katex_css: '<link rel="stylesheet" href="/api/static-libs/katex/katex.min.css">',
      katex_js: '<script src="/api/static-libs/katex/katex.min.js"></script>',
      katex_auto_render:
        '<script src="/api/static-libs/katex/contrib/auto-render.min.js"></script>',
      d3: '<script src="/api/static-libs/d3/d3.min.js"></script>',
    },
  };

  if (preparedLibs.includes('katex')) {
    manifest.libraries.katex = {
      version: '0.16.38',
      files: ['katex.min.css', 'katex.min.js', 'contrib/auto-render.min.js', 'fonts/'],
    };
  }

  if (preparedLibs.includes('tailwind')) {
    manifest.libraries.tailwind = {
      version: '3.4.17',
      files: ['tailwind.min.js'],
    };
  }

  if (preparedLibs.includes('d3')) {
    manifest.libraries.d3 = {
      version: '7.9.0',
      files: ['d3.min.js'],
    };
  }

  const manifestPath = path.join(PUBLIC_LIBS_DIR, 'manifest.json');
  await fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('\n✓ Generated manifest.json');
}

async function main() {
  console.log('Preparing static libraries for offline use...\n');

  const preparedLibs = [];

  try {
    await ensureDir(PUBLIC_LIBS_DIR);

    for (const lib of LIBRARIES) {
      const success = await prepareLibrary(lib);
      if (success) preparedLibs.push(lib.name);
    }

    await prepareTailwind();
    preparedLibs.push('tailwind');

    await generateManifest(preparedLibs);

    console.log('\n✓ All libraries prepared successfully!');
    console.log(`  Location: ${PUBLIC_LIBS_DIR}`);
    console.log(`  Prepared: ${preparedLibs.join(', ')}`);
  } catch (error) {
    console.error('\n✗ Failed to prepare libraries:', error);
    process.exit(1);
  }
}

main();
