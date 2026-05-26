import fs from 'node:fs/promises';
import path from 'node:path';
import type { BatchLogEntry } from '../types';

export interface BatchLog {
  entries: BatchLogEntry[];
  info: (message: string, styleNumber?: string) => void;
  warning: (message: string, styleNumber?: string) => void;
  error: (message: string, styleNumber?: string) => void;
}

function timestampForFile(): string {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
}

function createEntry(level: BatchLogEntry['level'], message: string, styleNumber?: string): BatchLogEntry {
  return {
    time: new Date().toISOString(),
    level,
    message,
    styleNumber
  };
}

export function createBatchLog(): BatchLog {
  const entries: BatchLogEntry[] = [];

  return {
    entries,
    info: (message, styleNumber) => entries.push(createEntry('info', message, styleNumber)),
    warning: (message, styleNumber) => entries.push(createEntry('warning', message, styleNumber)),
    error: (message, styleNumber) => entries.push(createEntry('error', message, styleNumber))
  };
}

function formatEntry(entry: BatchLogEntry): string {
  const styleNumber = entry.styleNumber ? ` [款号:${entry.styleNumber}]` : '';
  return `${entry.time} [${entry.level.toUpperCase()}]${styleNumber} ${entry.message}`;
}

export async function writeBatchLog(outputDir: string, entries: BatchLogEntry[]): Promise<string> {
  const logDir = path.join(outputDir, 'logs');
  await fs.mkdir(logDir, { recursive: true });

  const logPath = path.join(logDir, `中控台日志_${timestampForFile()}.txt`);
  const content = entries.length
    ? `${entries.map(formatEntry).join('\n')}\n`
    : `${formatEntry(createEntry('info', '本次批处理没有产生详细日志'))}\n`;

  await fs.writeFile(logPath, content, 'utf8');
  return logPath;
}
