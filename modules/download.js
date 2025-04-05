const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');
const streamPipeline = promisify(require('stream').pipeline);

async function downloadArchive(url, outputPath) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  await streamPipeline(response.data, fs.createWriteStream(outputPath));
}

module.exports = { downloadArchive };
