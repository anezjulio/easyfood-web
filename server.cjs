const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const DIST = path.join(__dirname, "dist");

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  let filePath = path.join(DIST, urlPath);

  // Si no existe el archivo, devolvemos index.html
  // para soportar React Router / SPA.
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end("Error al cargar la aplicación");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
    });

    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Aplicación disponible en http://localhost:${PORT}`);
});