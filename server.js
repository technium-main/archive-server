const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { downloadArchive } = require('./modules/download');
const { extractArchive } = require('./modules/extract');
const { readExtractedFiles } = require('./modules/read-files');

const app = express();
app.use(express.json());

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.post('/extract', async (req, res) => {
  const { archiveUrl } = req.body;
  if (!archiveUrl) return res.status(400).json({ error: 'archiveUrl is required' });

  const ext = path.extname(archiveUrl).toLowerCase();
  if (!['.zip', '.rar', '.7z'].includes(ext)) {
    return res.status(400).json({ error: 'Unsupported archive type' });
  }

  const tempDir = path.join(os.tmpdir(), 'archive_' + uuidv4());
  const archivePath = path.join(tempDir, 'archive' + ext);

  try {
    await fs.promises.mkdir(tempDir, { recursive: true });

    await downloadArchive(archiveUrl, archivePath);
    await extractArchive(archivePath, tempDir);

    const files = await readExtractedFiles(tempDir);

    res.json({ files });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📦 Archive server running on port ${PORT}`);
});
