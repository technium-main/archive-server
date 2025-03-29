const AdmZip = require('adm-zip');

async function extractArchive(archivePath, outputPath) {
  const zip = new AdmZip(archivePath);
  zip.extractAllTo(outputPath, true);
}

module.exports = { extractArchive };
