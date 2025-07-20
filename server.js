const axios = require('axios');
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const FileType = require('file-type');
const { downloadArchive } = require('./modules/download');
const { extractArchive } = require('./modules/extract');
const { readExtractedFiles } = require('./modules/read-files');
const { uploadFiles } = require("./modules/upload-files-to-open-ai");
require('dotenv').config();

const CODE_EXTENSIONS = ['.html', '.css', '.js', '.py', '.json', '.ts', '.tsx', '.jsx']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z'];

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.options('*', cors());

app.use(express.json());

app.post('/extract', async (req, res) => {
  const { archiveUrl } = req.body;
  if (!archiveUrl) return res.status(400).json({ error: 'archiveUrl is required' });

  const ext = path.extname(archiveUrl).toLowerCase();
  if (!ARCHIVE_EXTENSIONS.includes(ext)) {
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
  const { prompt, assistant_key, files = [], links } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // links
  // TODO добавить работу со ссылками

  // нам нужно выцепить из файлов изображения, чтобы не отдавать их code_interpreter и file_search
  // т.к. они их не умеют все равно распознавать
  const imageFiles = []
  const nonImageFiles = []

  files.forEach((file) => {
    const { filename } = file;

    const ext = path.extname(filename).toLowerCase();

    if (IMAGE_EXTENSIONS.includes(ext)) {
      imageFiles.push(file)
    } else {
      nonImageFiles.push(file)
    }
  })

  try {
    const threadRes = await axios.post(
      'https://api.openai.com/v1/threads',
      {
        messages: [
          {
            role: 'user',
            content: [
              // добавляем промпт
              { text: prompt, type: 'text' },

              // добавляем изображения для gpt-4o
              ...imageFiles.map(({ id }) => ({ image_file: id, type: 'image_file' }))
            ],

            // добавляем в аттачи то что может прочитать code_interpreter и file_search
            attachments: nonImageFiles.length > 0 ? nonImageFiles.map(({ id, filename }) => {
              const ext = path.extname(filename).toLowerCase();

              const isCode = CODE_EXTENSIONS.includes(ext)

              return {
                file_id: id,
                tools: [ isCode ? { type: 'code_interpreter' } : { type: 'file_search' } ]
              }
            }) : []
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    const threadId = threadRes.data.id;

    const assistant_id =
        (assistant_key === 'qa'
            ? process.env.QA_ASSISTANT_ID :
            assistant_key === 'python'
                ? process.env.PYTHON_ASSISTANT_ID
                : process.env.FRONTEND_ASSISTANT_ID)
        || process.env.ASSISTANT_ID;

    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      { assistant_id },
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

app.post('/upload', multer().array('files[]'), async (req, res) => {
  // принимаем файлы, которые не смогли загрузить на клиенте, чтобы загрузить отсюда
  const filesToDownload = req.body.files_to_download || [];
  const uploadedFiles = req.files || [];

  if (!uploadedFiles.length && !filesToDownload.length) {
    return res.status(400).json({error: 'No files provided'});
  }

  try {
    const downloadedFiles = await Promise.all(
      filesToDownload.map(async (url) => {
        const response = await axios.get(url, {responseType: 'arraybuffer'});
        const buffer = Buffer.from(response.data);
        const fileType = await FileType.fileTypeFromBuffer(buffer);
        const filename = url.split('/').pop() + (fileType?.ext ? `.${fileType.ext}` : '');

        return {
          buffer,
          originalname: filename,
          mimetype: fileType?.mime || response.headers['content-type']
        };
      })
    );

    const allFiles = [...uploadedFiles, ...downloadedFiles];
    const processedFiles = await uploadFiles(allFiles);

    res.json({files: processedFiles});
  } catch (err) {
    console.error('Error processing files:', err);
    res.status(500).json({error: 'Error processing files'});
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`📦 Archive server running on port ${PORT}`);
});
