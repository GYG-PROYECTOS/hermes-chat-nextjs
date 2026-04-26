import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

interface WikiFile {
  name: string;
  slug: string;
  content: string;
  preview: string;
}

function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractPreview(content: string, query: string, maxLen = 600): string {
  const normalized = normalizeText(content);
  const normalizedQuery = normalizeText(query);
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);
  let bestPos = 0;
  let bestScore = 0;
  for (const word of queryWords) {
    const pos = normalized.indexOf(word);
    if (pos !== -1) {
      const score = queryWords.filter(w => normalized.substring(Math.max(0, pos - 100), pos + 100).includes(w)).length;
      if (score > bestScore) { bestScore = score; bestPos = Math.max(0, pos - 50); }
    }
  }
  let preview = content.substring(bestPos, bestPos + maxLen);
  if (bestPos > 0) preview = '...' + preview;
  if (bestPos + maxLen < content.length) preview = preview + '...';
  return preview.replace(/^#+\s+/gm, '').replace(/\*\*/g, '').replace(/\n+/g, ' ').trim();
}

function listWikiFiles(folder = ''): WikiFile[] {
  const files: WikiFile[] = [];
  const fullDir = path.join(WIKI_PATH, folder);
  if (!fs.existsSync(fullDir)) return files;

  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
      const filePath = path.join(fullDir, entry.name);
      const content = fs.readFileSync(filePath, 'utf-8');
      const slug = (folder ? folder + '/' : '') + entry.name.replace('.md', '');
      files.push({
        name: entry.name,
        slug,
        content,
        preview: extractPreview(content, '', 300),
      });
    }
  }
  return files;
}

function searchFiles(files: WikiFile[], query: string): WikiFile[] {
  const normalizedQuery = normalizeText(query);
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);

  const scored = files.map(file => {
    const normalizedContent = normalizeText(file.content);
    let score = 0;
    for (const word of queryWords) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = (file.content.match(regex) || []).length;
      score += matches;
      if (normalizeText(file.slug).includes(word)) score += 5;
    }
    return { file, score };
  });

  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score)
    .map(s => ({ ...s.file, preview: extractPreview(s.file.content, query) }));
}

export async function POST(req: NextRequest) {
  try {
    const { question, folder } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Pregunta requerida' }, { status: 400 });
    }

    const cleanQuestion = question.trim();
    const targetFolder = folder || '';

    const allFiles = listWikiFiles(targetFolder);

    if (allFiles.length === 0) {
      return NextResponse.json({
        answer: folder
          ? `El cuaderno "${folder}" está vacío.`
          : 'No hay documentos en la wiki. Cargá PDFs primero.',
        sources: [],
      });
    }

    const results = searchFiles(allFiles, cleanQuestion);

    if (results.length === 0) {
      return NextResponse.json({
        answer: `No encontré información sobre "<strong>${cleanQuestion}</strong>"${folder ? ` en ${folder}` : ''}.`,
        sources: [],
      });
    }

    // Sin Gemini - devolver resultados de búsqueda como respuesta directa
    const topFiles = results.slice(0, 3);
    const answerParts = topFiles.map(f => {
      const title = f.slug.replace(/\//g, ' / ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `📄 ${title}\n\n${f.preview}`;
    });

    const answer = `Encontré ${results.length} resultado(s) para "<strong>${cleanQuestion}</strong>":\n\n${answerParts.join('\n\n---\n\n')}`;

    const sources = topFiles.map(f => ({
      title: f.slug.replace(/\//g, ' / ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      slug: f.slug,
    }));

    return NextResponse.json({ answer, sources });

  } catch (err: any) {
    console.error('[/api/chat]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
