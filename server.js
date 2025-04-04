const axios = require('axios');
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { downloadArchive } = require('./modules/download');
const { extractArchive } = require('./modules/extract');
const { readExtractedFiles } = require('./modules/read-files');
require('dotenv').config();

if (!process.env.OPENAI_API_KEY || !process.env.ASSISTANT_ID) {
  console.error("❌ Missing .env variables: OPENAI_API_KEY or ASSISTANT_ID");
  process.exit(1);
}

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

app.post('/assistant', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const threadRes = await axios.post(
      'https://api.openai.com/v1/threads',
      { messages: [{ role: 'user', content: prompt }] },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    const threadId = threadRes.data.id;

    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      { assistant_id: process.env.ASSISTANT_ID },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    const runId = runRes.data.id;

    let status = 'queued';
    while (status !== 'completed') {
      await new Promise(r => setTimeout(r, 1500));

      const checkRes = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2',
          },
        }
      );

      status = checkRes.data.status;
    }

    const messagesRes = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    const reply = messagesRes.data.data.find(m => m.role === 'assistant')?.content?.[0]?.text?.value;

    res.json({ reply: reply || 'Нет ответа от ассистента.' });

  } catch (err) {
    console.error('Ошибка при запросе к OpenAI:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка при работе с ассистентом' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📦 Archive server running on port ${PORT}`);
});
