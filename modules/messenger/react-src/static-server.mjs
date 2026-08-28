import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const ROOT = 'D:\\CloudeCodeProject\\Horseoff';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

/* Три секунды тишины: настоящий звук, по которому видно перемотку. */
function silentWav(seconds = 3, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  return buf;
}
const WAV = silentWav();

function sendMedia(req, res) {
  const range = req.headers.range;
  const total = WAV.length;
  if (!range) {
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': total, 'Accept-Ranges': 'bytes' });
    return res.end(WAV);
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = m[1] ? Number(m[1]) : 0;
  const end = m[2] ? Number(m[2]) : total - 1;
  res.writeHead(206, {
    'Content-Type': 'audio/wav',
    'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
  });
  return res.end(WAV.subarray(start, end + 1));
}

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath.startsWith('/api/msg/file/')) return sendMedia(req, res);
    const filePath = join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(8896, () => console.log("listening on 8896"));
