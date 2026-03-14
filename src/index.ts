#!/usr/bin/env node
import express from "express";
import path from "path";
import compression from "compression";
import { setDataDir, getTasks } from "./store";
import { setAttachmentsDataDir, migrateAttachments, getAttachmentPath, cleanupOldAttachments } from "./attachments";
import apiRouter from "./routes";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { Task } from "./types";

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 3456;
  let dataDir = path.resolve("data");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) port = parseInt(args[i + 1], 10);
    if (args[i] === "--data" && args[i + 1]) dataDir = path.resolve(args[i + 1]);
  }

  return { port, dataDir };
}

const { port, dataDir } = parseArgs();
setDataDir(dataDir);
setAttachmentsDataDir(dataDir);

// --- Migration: extract base64 attachments to disk ---
function runMigration() {
  const tasksPath = path.join(dataDir, "tasks.json");
  if (!existsSync(tasksPath)) return;
  
  try {
    const tasks: Task[] = JSON.parse(readFileSync(tasksPath, "utf-8"));
    const hasBase64 = tasks.some(t => t.attachments?.some(a => a.data));
    if (!hasBase64) {
      console.log("[migration] No base64 attachments to migrate");
      return;
    }
    
    const { migrated, filesWritten } = migrateAttachments(tasks);
    if (migrated > 0) {
      const tmp = tasksPath + ".tmp";
      writeFileSync(tmp, JSON.stringify(tasks, null, 2));
      const { renameSync } = require("fs");
      renameSync(tmp, tasksPath);
      console.log(`[migration] Migrated ${migrated} attachments, ${filesWritten} files written`);
    }
  } catch (e) {
    console.error("[migration] Failed:", e);
  }
}

runMigration();

// --- Cleanup old attachments (>14 days) ---
function runCleanup() {
  try {
    const tasksPath = path.join(dataDir, "tasks.json");
    if (!existsSync(tasksPath)) return;
    const tasks: Task[] = JSON.parse(readFileSync(tasksPath, "utf-8"));
    const deleted = cleanupOldAttachments(tasks);
    if (deleted > 0) {
      const tmp = tasksPath + ".tmp";
      writeFileSync(tmp, JSON.stringify(tasks, null, 2));
      const { renameSync } = require("fs");
      renameSync(tmp, tasksPath);
      console.log(`[cleanup] Deleted ${deleted} old attachment files`);
    }
  } catch (e) {
    console.error("[cleanup] Failed:", e);
  }
}

runCleanup();
setInterval(runCleanup, 6 * 60 * 60 * 1000); // every 6 hours

const app = express();

app.use(compression());
app.use(express.json({ limit: "10mb" }));

// Serve attachment files (no auth needed for viewing)
app.get("/api/attachments/:taskId/:filename", (req, res) => {
  const { taskId, filename } = req.params;
  const fp = getAttachmentPath(taskId, filename);
  if (!fp) return res.status(404).json({ error: "Attachment not found" });
  res.sendFile(fp);
});

// API routes
app.use("/api", apiRouter);

// Dashboard static files
app.use(express.static(path.join(__dirname, "..", "dashboard")));

// Client view (read-only dashboard)
app.get("/dashboard/client/:projectId", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "dashboard", "client.html"));
});

// SPA fallback
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "dashboard", "index.html"));
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err.stack || err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Agent Board running at http://localhost:${port}`);
  console.log(`Dashboard: http://localhost:${port}`);
  console.log(`API: http://localhost:${port}/api`);
  console.log(`Data dir: ${dataDir}`);
});
