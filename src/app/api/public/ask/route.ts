import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

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

function listFilesRecursive(dir = ''): Array<{ name: string; content: string }> {
  const files: Array<{ name: string; content: string }> = [];
  const fullDir = path.join(WIKI_PATH, dir);
  if (!fs.existsSync(fullDir)) return files;
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
      const fullPath = path.join(fullDir, entry.name);
      const content = fs.readFileSync(fullPath, 'utf-8');
      files.push({ name: path.join(dir, entry.name).replace('.md', ''), content });
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      files.push(...listFilesRecursive(path.join(dir, entry.name)));
    }
  }
  return files;
}

function search(query: string, files: ReturnType<typeof listFilesRecursive>) {
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

  if (!genAI) return NextResponse.json({ error: 'API Gemini no configurada' }, { status: 500 });

  const { question } = await req.json();
  if (!question) return NextResponse.json({ error: 'question requerida' }, { status: 400 });

  const allFiles = listFilesRecursive();
  if (allFiles.length === 0) return NextResponse.json({ answer: 'Wiki vacía.', sources: [] });

  const results = search(question, allFiles);
  if (results.length === 0) return NextResponse.json({ answer: `No encontré información sobre "${question}".`, sources: [] });

  const top = results.slice(0, 3);
  const context = top.map(f => `=== ${f.name} ===\n${f.content}`).join('\n\n');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `Sos un asistente de investigación. Respondé usando ÚNICAMENTE la información del contexto. Si no está, decilo.

Reglas:
- Citá la fuente [archivo]
- Respondé en español
- Sé preciso

CONTEXTO:
${context}

PREGUNTA: ${question}

RESPUESTA:`;

  const geminiRes = await model.generateContent(prompt);
  const answer = geminiRes.response.text();

  return NextResponse.json({
    answer,
    sources: top.map(f => ({ title: f.name, slug: f.name })),
  });
}
