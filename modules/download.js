const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');
const streamPipeline = promisify(require('stream').pipeline);

async function downloadArchive(url, outputPath) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Referer': 'https://ivashev-education.ru/',
      'Origin': 'https://ivashev-education.ru/'
    }
  });
  await streamPipeline(response.data, fs.createWriteStream(outputPath));
}

module.exports = { downloadArchive };
