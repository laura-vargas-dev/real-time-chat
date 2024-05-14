import express from "express";
import logger from "morgan";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

dotenv.config();

const port = process.env.PORT ?? 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
});

const db = createClient({
  url: process.env.DB_URL,
  authToken: process.env.DB_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`);

app.use(logger("dev"));

app.get("/", (_req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

io.on("connection", async (socket) => {
  let result;
  const username = socket.handshake.auth.username ?? "anonymous";
  console.log(`${username} has connected!`);

  socket.on("disconnect", () => {
    console.log("A user has disconnected!");
  });

  socket.on("chat message", async (message) => {
    try {
      result = await db.execute({
        sql: "INSERT INTO messages (content, user) VALUES (:message, :username)",
        args: { message, username },
      });
    } catch (error) {
      console.error(error);
      return;
    }
    io.emit(
      "chat message",
      message,
      result.lastInsertRowid.toString(),
      username
    );
  });

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: "SELECT id, content, user FROM messages WHERE id > ?",
        args: [socket.handshake.auth.serverOffset ?? 0],
      });
      results.rows.forEach((row) => {
        io.emit("chat message", row.content, row.id.toString(), row.user);
      });
    } catch (error) {
      console.error(error);
      return;
    }
  }
});

server.listen(port, () => {
  console.log(`Server running in port ${port}`);
});
