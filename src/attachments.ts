import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync, rmSync } from "fs";
import path from "path";
import crypto from "crypto";
import { Task, Attachment } from "./types";

let dataDir = path.resolve("data");

export function setAttachmentsDataDir(dir: string) {
  dataDir = dir;
}

function attachmentsDir(): string {
  return path.join(dataDir, "attachments");
}

function taskAttDir(taskId: string): string {
  return path.join(attachmentsDir(), taskId);
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Save base64 data to disk, return updated attachment (without data field) */
export function saveAttachmentToDisk(taskId: string, att: Attachment): Attachment {
  if (!att.data) return att; // already migrated
  
  const buf = Buffer.from(att.data, "base64");
  const hash = sha256(buf);
  const dir = taskAttDir(taskId);
  ensureDir(dir);

  // Dedup: check if file with same hash exists for this task
  if (existsSync(dir)) {
    const existing = readdirSync(dir);
    for (const f of existing) {
      const fp = path.join(dir, f);
      try {
        const existingBuf = readFileSync(fp);
        if (sha256(existingBuf) === hash) {
          // Already exists — return ref to existing file
          const relPath = `attachments/${taskId}/${f}`;
          const { data: _, ...rest } = att;
          return { ...rest, filePath: relPath, hash };
        }
      } catch {}
    }
  }

  const safeFilename = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const diskName = `${att.id}_${safeFilename}`;
  const fp = path.join(dir, diskName);
  writeFileSync(fp, buf);

  const relPath = `attachments/${taskId}/${diskName}`;
  const { data: _, ...rest } = att;
  return { ...rest, filePath: relPath, hash };
}

/** Migrate all tasks: extract base64 attachments to disk */
export function migrateAttachments(tasks: Task[]): { migrated: number; filesWritten: number } {
  let migrated = 0;
  let filesWritten = 0;

  for (const task of tasks) {
    if (!task.attachments || task.attachments.length === 0) continue;
    
    let changed = false;
    task.attachments = task.attachments.map(att => {
      if (!att.data) return att; // already migrated
      changed = true;
      migrated++;
      filesWritten++;
      return saveAttachmentToDisk(task.id, att);
    });

    if (changed) {
      // mark for save (caller should persist)
    }
  }

  return { migrated, filesWritten };
}

/** Get absolute path for an attachment file */
export function getAttachmentPath(taskId: string, filename: string): string | null {
  // Prevent path traversal
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return null;
  
  const fp = path.join(taskAttDir(taskId), filename);
  if (!existsSync(fp)) return null;
  return fp;
}

/** Delete attachment directory for a task */
export function deleteTaskAttachments(taskId: string): void {
  const dir = taskAttDir(taskId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Clean up attachments older than 14 days. Returns count of deleted files. */
export function cleanupOldAttachments(tasks: Task[]): number {
  const maxAge = 14 * 24 * 60 * 60 * 1000; // 14 days in ms
  const now = Date.now();
  const baseDir = attachmentsDir();
  let deleted = 0;

  if (!existsSync(baseDir)) return 0;

  for (const taskDirName of readdirSync(baseDir)) {
    const taskDir = path.join(baseDir, taskDirName);
    let stat;
    try { stat = statSync(taskDir); } catch { continue; }
    if (!stat.isDirectory()) continue;

    const files = readdirSync(taskDir);
    for (const file of files) {
      const fp = path.join(taskDir, file);
      try {
        const fstat = statSync(fp);
        if (now - fstat.mtimeMs > maxAge) {
          unlinkSync(fp);
          deleted++;

          // Remove from task attachments array
          const task = tasks.find(t => t.id === taskDirName);
          if (task && task.attachments) {
            task.attachments = task.attachments.filter(a => {
              if (a.filePath && a.filePath.endsWith(`/${file}`)) return false;
              return true;
            });
          }
        }
      } catch {}
    }

    // Remove empty dir
    try {
      if (readdirSync(taskDir).length === 0) rmSync(taskDir, { recursive: true, force: true });
    } catch {}
  }

  return deleted;
}
