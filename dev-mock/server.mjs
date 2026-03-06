import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// ローカル動画ファイル配信 (dev-mock/static/ に置いたファイル)
app.use('/static', express.static(join(__dirname, 'static')));

// /watch/:id, /live/:id, /event/:id → モック Netflix ページ
app.get('/:type(watch|live|event)/:id', (req, res) => {
  res.sendFile(join(__dirname, 'netflix.html'));
});

// ルート → デフォルトの watch ページへリダイレクト
app.get('/', (req, res) => {
  res.redirect('/watch/81234567');
});

app.listen(PORT, () => {
  console.log('');
  console.log('  Mock Netflix Server');
  console.log('  -------------------');
  console.log(`  VOD:   http://localhost:${PORT}/watch/81234567`);
  console.log(`  Live:  http://localhost:${PORT}/live/81234567`);
  console.log(`  Event: http://localhost:${PORT}/event/81234567`);
  console.log('');
});
