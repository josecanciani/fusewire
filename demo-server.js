import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8000;

const jsPath = "/js";
const jsDiskPath = path.join(__dirname, "src");
const htdocsPath = "/";
const htdocsDiskPath = path.join(__dirname, "htdocs");
const nodeModulesPath = "/node_modules";
const nodeModulesDiskPath = path.join(__dirname, "node_modules");
const docsPath = "/docs";
const docsDiskPath = path.join(__dirname, "docs");
const testPath = "/test";
const testDiskPath = path.join(__dirname, "test");

app.use((req, res, next) => {
    res.on("finish", () => {
        if (res.statusCode >= 400) {
            console.log(`[Server] ${res.statusCode} - ${req.method} ${req.url}`);
        }
    });
    next();
});

app.use(jsPath, express.static(jsDiskPath));
app.use(docsPath, express.static(docsDiskPath));
app.use(testPath, express.static(testDiskPath));
app.use(htdocsPath, express.static(htdocsDiskPath));
app.use(nodeModulesPath, express.static(nodeModulesDiskPath));

// Fallback for SPA routing: serve index.html for unknown routes
app.get(/^(?!\/(js|docs|node_modules)).*$/, (req, res, next) => {
    // If it's a request for a file (has extension), let it fail 404
    if (path.extname(req.path)) {
        return next();
    }
    res.sendFile(path.join(htdocsDiskPath, "index.html"));
});

app.listen(PORT, () => {
    console.log(`
FuseWire Demo Server

  http://localhost:${PORT}

Routes:
  ${htdocsPath}  → ${path.relative(__dirname, htdocsDiskPath)}
  ${jsPath}  → ${path.relative(__dirname, jsDiskPath)}
  ${docsPath}  → ${path.relative(__dirname, docsDiskPath)}
  ${nodeModulesPath}  → ${path.relative(__dirname, nodeModulesDiskPath)}

Press Ctrl+C to stop
    `);
});
