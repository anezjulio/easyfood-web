import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import connect from "connect";
import sirv from "sirv";
import { installApi } from "./api";

const port = Number(process.env.PORT || 8080);
const dist = resolve(process.cwd(), "dist");
const index = readFileSync(resolve(dist, "index.html"));
const app = connect();
installApi(app);
app.use(sirv(dist, { etag: true, maxAge: 0 }));
app.use((req, res) => {
  if ((req.method === "GET" || req.method === "HEAD") && req.headers.accept?.includes("text/html")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.end(req.method === "HEAD" ? undefined : index);
    return;
  }
  res.statusCode = 404;
  res.end("Not found");
});
createServer(app).listen(port, "0.0.0.0", () => {
  console.log(`Easyfood listening on port ${port}`);
});
