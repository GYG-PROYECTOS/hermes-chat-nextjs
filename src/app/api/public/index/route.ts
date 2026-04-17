import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

function checkToken(token: string | null): boolean {
  const publicToken = process.env.PUBLIC_TOKEN;
  if (!publicToken) return true;
  return token === publicToken;
}

function listFilesRecursive(dir = ''): Array<{ name: string; type: string }> {
  const files: Array<{ name: string; type: string }> = [];
  const fullDir = path.join(WIKI_PATH, dir);
  if (!fs.existsSync(fullDir)) return files;
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      files.push({ name: rel, type: 'folder' });
      files.push(...listFilesRecursive(rel));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
      files.push({ name: rel.replace('.md', ''), type: 'file' });
    }
  }
  return files;
}

// GET /api/public/index
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  if (!checkToken(token)) return new NextResponse(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const files = listFilesRecursive();
  return NextResponse.json({ total: files.length, files });
}

// HEAD /api/public/index
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
