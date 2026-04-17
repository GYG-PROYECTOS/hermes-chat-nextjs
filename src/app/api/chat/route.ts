import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

interface WikiFile {
  name: string;
  slug: string;
  content: string;
  preview: string;
}

// Normalize text for accent-insensitive search
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Extract a preview snippet from content
function extractPreview(content: string, query: string, maxLen = 600): string {
  const normalized = normalizeText(content);
  const normalizedQuery = normalizeText(query);
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);

  // Find the best matching position
  let bestPos = 0;
  let bestScore = 0;

  for (const word of queryWords) {
    const pos = normalized.indexOf(word);
    if (pos !== -1) {
      const score = queryWords.filter(w => normalized.substring(Math.max(0, pos - 100), pos + 100).includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestPos = Math.max(0, pos - 50);
      }
    }
  }

  let preview = content.substring(bestPos, bestPos + maxLen);
  if (bestPos > 0) preview = '...' + preview;
  if (bestPos + maxLen < content.length) preview = preview + '...';

  // Clean markdown artifacts for preview
  preview = preview
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  return preview;
}

// List all .md files in wiki
async function listWikiFiles(): Promise<WikiFile[]> {
  const files: WikiFile[] = [];

  try {
    const entries = fs.readdirSync(WIKI_PATH, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
        const filePath = path.join(WIKI_PATH, entry.name);
        const content = fs.readFileSync(filePath, 'utf-8');
        const slug = entry.name.replace('.md', '');
        const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        files.push({
          name: entry.name,
          slug,
          content,
          preview: extractPreview(content, '', 300),
        });
      }
    }
  } catch (err) {
    console.error('Error reading wiki:', err);
  }

  return files;
}

// Search files by query
function searchFiles(files: WikiFile[], query: string): WikiFile[] {
  const normalizedQuery = normalizeText(query);
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);

  const scored = files.map(file => {
    const normalizedContent = normalizeText(file.content);
    let score = 0;

    for (const word of queryWords) {
      // Count occurrences
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = (file.content.match(regex) || []).length;
      score += matches;

      // Bonus if word is in title/slug
      if (normalizeText(file.slug).includes(word)) score += 5;
    }

    return { file, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => ({
      ...s.file,
      preview: extractPreview(s.file.content, query),
    }));
}

// Build context from top files
function buildContext(files: WikiFile[], maxTokens = 60000): string {
  let context = '';
  const genAI = require('@google/generative-ai');

  for (const file of files) {
    const estimatedTokens = file.content.length / 4;
    if (context.length / 4 + estimatedTokens > maxTokens) break;
    context += `\n\n## ${file.title || file.slug}\n\n${file.content}`;
  }

  return context;
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Pregunta requerida' }, { status: 400 });
    }

    if (!genAI) {
      return NextResponse.json({ error: 'GEMINI_API_KEY no configurada' }, { status: 500 });
    }

    const cleanQuestion = question.trim();

    // 1. List all wiki files
    const allFiles = await listWikiFiles();

    if (allFiles.length === 0) {
      return NextResponse.json({
        answer: 'No hay documentos en la wiki. Cargá PDFs primero.',
        sources: [],
      });
    }

    // 2. Search relevant files
    const results = searchFiles(allFiles, cleanQuestion);

    if (results.length === 0) {
      return NextResponse.json({
        answer: `No encontré información sobre "<strong>${cleanQuestion}</strong>". Probá con otros términos.`,
        sources: [],
      });
    }

    // 3. Build context from top 3 files
    const topFiles = results.slice(0, 3);
    const context = topFiles.map(f => `=== ${f.slug} ===\n${f.content}`).join('\n\n');

    // 4. Call Gemini Flash
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Sos un asistente de investigación especializado en documentos legales bolivianos (UNEFCO).

Respondé la pregunta del usuario usando ÚNICAMENTE la información proporcionada en el contexto. Si la respuesta no está en el contexto, decí claramente que no encontrás esa información.

Reglas:
- Citá la fuente usando [archivo]
- Sé preciso con artículos y numeración
- Respondé en español
- Si la info es ambigua, mencioná la incertidumbre

CONTEXTO:
${context}

PREGUNTA: ${cleanQuestion}

RESPUESTA:`;

    const geminiRes = await model.generateContent(prompt);
    const answer = geminiRes.response.text();

    // 5. Format response
    const formattedAnswer = answer
      .replace(/^/gm, '')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    const sources = topFiles.map(f => ({
      title: f.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      slug: f.slug,
    }));

    return NextResponse.json({
      answer: formattedAnswer,
      sources,
    });

  } catch (err: any) {
    console.error('[/api/chat]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
