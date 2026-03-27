import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8000;

const jsPath = '/js';
const jsDiskPath = path.join(__dirname, 'src');
const examplesPath = '/';
const examplesDiskPath = path.join(__dirname, 'examples', 'client-only');

app.use(jsPath, express.static(jsDiskPath));
app.use(examplesPath, express.static(examplesDiskPath));

app.listen(PORT, () => {
    console.log(`
FuseWire Examples Server

  http://localhost:${PORT}

Routes:
  ${examplesPath}  → ${path.relative(__dirname, examplesDiskPath)}
  ${jsPath}  → ${path.relative(__dirname, jsDiskPath)}

Press Ctrl+C to stop
    `);
});
