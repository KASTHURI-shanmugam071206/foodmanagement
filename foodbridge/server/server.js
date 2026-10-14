import http from "node:http";
import { pathToFileURL } from "node:url";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { checkDatabaseConnection, pool } from "./config/database.js";
import { initSocket } from "./services/socketService.js";

let server;

export async function startServer() {
  try {
    await checkDatabaseConnection();
    console.log(JSON.stringify({
      level: "info",
      message: "MySQL connection established",
      database: env.DB_NAME
    }));

    const httpServer = http.createServer(app);
    initSocket(httpServer);

    server = httpServer.listen(env.PORT, () => {
      console.log(`FoodBridge API & Socket.IO listening on http://localhost:${env.PORT}`);
    });
    return server;
  } catch (error) {
    console.error("Failed to start FoodBridge API:", error.message);
    process.exitCode = 1;
    await pool.end().catch(() => {});
    return null;
  }
}

export async function shutdown(signal) {
  console.log(`${signal} received; shutting down FoodBridge API`);
  if (server) {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  } else {
    await pool.end();
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  startServer();
}
