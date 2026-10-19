import { createServer } from "node:http";
import { env } from "#src/config/env.js";
import { initSocket } from "#src/index.js";

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "socket" }));
    return;
  }
  res.writeHead(404).end();
});

initSocket(httpServer);

httpServer.listen(env.port, () => {
  console.log(`Socket service listening on port ${env.port}`);
});
