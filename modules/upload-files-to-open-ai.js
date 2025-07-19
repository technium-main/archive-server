const axios = require('axios');
const FormData = require('form-data');

async function uploadFiles(files) {
  const results = [];

  for (const file of files) {
    const { originalname, mimetype, buffer } = file

    const form = new FormData();

    form.append('file', buffer, {
      filename: originalname,
      contentType: mimetype,
    })
    form.append('purpose', 'user_data');

    try {
      const response = await axios.post('https://api.openai.com/v1/files', form, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          ...form.getHeaders()
        }
      });

      results.push(response.data);
    } catch (error) {
      console.error(`Error uploading file ${file.name || 'file'}:`, error.response?.data || error.message);

      throw error;
    }
  }

  return results;
}

module.exports = { uploadFiles };
