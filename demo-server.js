import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8000;

const jsPath = '/js';
const jsDiskPath = path.join(__dirname, 'src');
const htdocsPath = '/';
const htdocsDiskPath = path.join(__dirname, 'htdocs');

app.use(jsPath, express.static(jsDiskPath));
app.use(htdocsPath, express.static(htdocsDiskPath));

app.listen(PORT, () => {
    console.log(`
FuseWire Demo Server

  http://localhost:${PORT}

Routes:
  ${htdocsPath}  → ${path.relative(__dirname, htdocsDiskPath)}
  ${jsPath}  → ${path.relative(__dirname, jsDiskPath)}

Press Ctrl+C to stop
    `);
});
