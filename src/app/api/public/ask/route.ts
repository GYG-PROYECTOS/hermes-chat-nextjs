import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

function checkToken(token: string | null): boolean {
  const publicToken = process.env.PUBLIC_TOKEN;
  if (!publicToken) return true;
  return token === publicToken;
}

function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractPreview(content: string, query: string, maxLen = 600): string {
  const normalized = normalizeText(content);
  const normalizedQuery = normalizeText(query);
  const queryWords = normalizedQuery.split(/\s+/).filter((w: string) => w.length > 2);
  let bestPos = 0;
  let bestScore = 0;
  for (const word of queryWords) {
    const pos = normalized.indexOf(word);
    if (pos !== -1) {
      const score = queryWords.filter((w: string) => normalized.substring(Math.max(0, pos - 100), pos + 100).includes(w)).length;
      if (score > bestScore) { bestScore = score; bestPos = Math.max(0, pos - 50); }
    }
  }
  let preview = content.substring(bestPos, bestPos + maxLen);
  if (bestPos > 0) preview = '...' + preview;
  if (bestPos + maxLen < content.length) preview = preview + '...';
  return preview.replace(/^#+\s+/gm, '').replace(/\*\*/g, '').replace(/\n+/g, ' ').trim();
}

function listFiles(folder = ''): Array<{ name: string; content: string }> {
  const files: Array<{ name: string; content: string }> = [];
  const fullDir = path.join(WIKI_PATH, folder);
  if (!fs.existsSync(fullDir)) return files;
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
      const fullPath = path.join(fullDir, entry.name);
      const content = fs.readFileSync(fullPath, 'utf-8');
      files.push({ name: path.join(folder, entry.name).replace('.md', ''), content });
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      files.push(...listFiles(path.join(folder, entry.name)));
    }
  }
  return files;
}

function search(query: string, files: ReturnType<typeof listFiles>) {
  const nq = normalizeText(query);
  const words = nq.split(/\s+/).filter((w: string) => w.length > 2);
  return files.map(f => {
    const nc = normalizeText(f.content);
    let score = 0;
    for (const w of words) {
      const regex = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      score += (f.content.match(regex) || []).length;
      if (normalizeText(f.name).includes(w)) score += 5;
    }
    return { ...f, score };
  }).filter(f => f.score > 0).sort((a, b) => b.score - a.score);
}

// POST /api/public/ask
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!checkToken(token)) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

  const { question, folder } = await req.json();
  if (!question) return NextResponse.json({ error: 'question requerida' }, { status: 400 });

  const targetFolder = folder || '';

  const files: Array<{ name: string; content: string }> = [];
  const fullDir = path.join(WIKI_PATH, targetFolder);
  if (fs.existsSync(fullDir)) {
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
        const fullPath = path.join(fullDir, entry.name);
        const content = fs.readFileSync(fullPath, 'utf-8');
        files.push({ name: path.join(targetFolder, entry.name).replace('.md', ''), content });
      }
    }
  }

  if (files.length === 0) {
    return NextResponse.json({
      answer: folder ? `El cuaderno "${folder}" está vacío o no existe.` : 'Wiki vacía.',
      sources: [],
    });
  }

  const results = search(question, files);
  if (results.length === 0) {
    return NextResponse.json({
      answer: `No encontré información sobre "${question}"${folder ? ` en ${folder}` : ''}.`,
      sources: [],
    });
  }

  // Sin Gemini - devolver resultados de búsqueda como respuesta directa
  const top = results.slice(0, 3);
  const answerParts = top.map(f => {
    const title = f.name.replace(/\//g, ' / ').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    const preview = extractPreview(f.content, question);
    return `📄 ${title}\n\n${preview}`;
  });

  const answer = `Encontré ${results.length} resultado(s) para "${question}":\n\n${answerParts.join('\n\n---\n\n')}`;

  return NextResponse.json({
    answer,
    sources: top.map(f => ({ title: f.name, slug: f.name })),
  });
}
