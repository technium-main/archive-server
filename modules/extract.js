const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const fs = require('fs');
const unzipper = require('unzipper');

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout);
    });
  });
}

async function extractArchive(archivePath, outputPath) {
  const ext = path.extname(archivePath).toLowerCase();

  if (ext === '.zip') {
    try {
      await fs.createReadStream(archivePath)
        .pipe(unzipper.Extract({ path: outputPath }))
        .promise();
    } catch (err) {
      throw new Error('Ошибка при распаковке .zip: ' + err.message);
    }
  } else if (ext === '.rar') {
    const unrar = os.platform() === 'darwin' ? 'unar' : 'unrar';
    const cmd = `${unrar} x -o+ "${archivePath}" "${outputPath}"`;
    try {
      await runCommand(cmd);
    } catch (err) {
      throw new Error('Ошибка при распаковке .rar: ' + err);
    }
  } else if (ext === '.7z') {
    const cmd = `7z x "${archivePath}" -o"${outputPath}" -y`;
    try {
      await runCommand(cmd);
    } catch (err) {
      throw new Error('Ошибка при распаковке .7z: ' + err);
    }
  } else {
    throw new Error('Неподдерживаемый формат архива');
  }
}

module.exports = { extractArchive };
