#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runMonitor } from './hertz-las-may-2027.mjs';

// Publish data only from a fresh remote checkout. Never stage the user's work.
const repo = resolve(import.meta.dirname, '../..');
const snapshotPath = process.argv[2] && resolve(process.argv[2]);
if (!snapshotPath || process.argv.length !== 3) throw new Error('Usage: node scripts/monitoring/hertz-publish.mjs /absolute/snapshot.json');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
if (snapshot?.schemaVersion !== 1 || !Number.isFinite(Date.parse(snapshot.capturedAt))) throw new Error('A timestamped browser snapshot is required.');
// runMonitor validates all evidence and records validation failures durably too.
const paths = ['.github/monitoring-data/hertz-las-may-2027-history.json', 'hertz-las-may-2027/history.json', 'hertz-las-may-2027/history.csv'];
const git = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let published = false;
let collectionError;
for (let attempt = 0; attempt < 3 && !published; attempt++) {
  git(['fetch', 'origin', 'master']);
  const checkout = await mkdtemp(resolve(tmpdir(), 'hertz-publish-'));
  git(['worktree', 'add', '--detach', checkout, 'origin/master']);
  try {
    const current = JSON.parse(await readFile(resolve(checkout, paths[0]), 'utf8'));
    if (current.runs.some(run => run.id === snapshot.capturedAt)) {
      console.log(`Already published ${snapshot.capturedAt}`);
      published = true;
      continue;
    }
    try {
      await runMonitor({ snapshotPath, historyPath: resolve(checkout, paths[0]), publicHistoryPath: resolve(checkout, paths[1]), publicCsvPath: resolve(checkout, paths[2]) });
    } catch (error) { collectionError = error; }
    git(['add', '--', ...paths], checkout);
    git(['commit', '-m', `Record Hertz browser check ${snapshot.capturedAt}`], checkout);
    try {
      git(['push', 'origin', 'HEAD:master'], checkout);
      published = true;
    } catch (error) {
      if (!/rejected|fetch first|non-fast-forward/i.test(String(error.stderr))) throw error;
      if (attempt === 2) throw error;
    }
  } finally {
    git(['worktree', 'remove', checkout]);
  }
}
console.log(`Published Hertz observation ${snapshot.capturedAt}. Verify history.json on the live site after Pages deploys.`);
if (collectionError) throw collectionError;
