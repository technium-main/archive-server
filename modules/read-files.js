const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTENSIONS = ['.js', '.html', '.css', '.json', '.txt'];

async function readExtractedFiles(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await readExtractedFiles(fullPath);
      files.push(...nested);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        files.push({ path: path.relative(dir, fullPath), content });
      }
    }
  }

  return files;
}

module.exports = { readExtractedFiles };
