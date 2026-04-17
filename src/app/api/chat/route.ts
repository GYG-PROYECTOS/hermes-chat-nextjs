import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_BASE = process.env.HERMES_API_URL || 'http://85.31.230.163:3000';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

interface HermesSearchResult {
  slug: string;
  title: string;
  preview: string;
  file: string;
  folder: string;
}

interface HermesSearchResponse {
  query: string;
  folder: string | null;
  total: number;
  results: HermesSearchResult[];
}

interface HermesPageResponse {
  slug: string;
  title: string;
  content: string;
  html_content: string;
  type: string;
  source: string;
  date: string;
  pages: string;
  backlinks: string[];
}

async function searchWiki(query: string): Promise<HermesSearchResponse | null> {
  const url = `${API_BASE}/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  return res.json();
}

async function getPage(slug: string, folder?: string): Promise<HermesPageResponse | null> {
  let url = `${API_BASE}/wiki/page/${encodeURIComponent(slug)}`;
  if (folder && folder !== 'root') {
    url += `?folder=${encodeURIComponent(folder)}`;
  }
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  return res.json();
}

async function listWikiPages(): Promise<string[]> {
  const url = `${API_BASE}/wiki/index`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.pages || [];
}

function buildPrompt(question: string, documents: { title: string; content: string }[]): string {
  let prompt = `Sos Hermes, un asistente de investigación profesional.\n\n`;
  prompt += `El usuario pregunta: "${question}"\n\n`;
  prompt += `A continuación te proporciono el contenido de los documentos relevantes:\n\n`;

  for (const doc of documents) {
    prompt += `--- DOCUMENTO: ${doc.title} ---\n${doc.content}\n\n`;
  }

  prompt += `--- INSTRUCCIONES ---\n`;
  prompt += `Respondé de forma precisa y profesional basándote únicamente en los documentos proporcionados.\n`;
  prompt += `Si la respuesta está en los documentos, citá el artículo o sección de donde sale.\n`;
  prompt += `Si no hay información suficiente, decilo claramente.\n`;
  prompt += `No inventés ni asumas información que no esté en los documentos.\n`;
  prompt += `Respondé en español, en formato claro con markdown cuando corresponda.\n`;

  return prompt;
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Pregunta requerida' }, { status: 400 });
    }

    const cleanQuestion = question.trim();

    // 1. Buscar documentos relevantes
    let searchData = await searchWiki(cleanQuestion);

    // 2. Si no hay resultados, buscar con keywords
    let usedFallback = false;
    if (!searchData || searchData.total === 0) {
      const stopwords = [
        'de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un',
        'para', 'con', 'que', 'es', 'una', 'fue', 'como', 'pero', 'más', 'sus',
        'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy',
        'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde',
        'todo', 'nos', 'durante', 'si', 'no', 'solo', 'puede', 'qué', 'cómo',
        'cuál', 'dónde', 'cuándo', 'cuánto', 'explica', 'describe', 'dime',
        'habla', 'cuéntame', 'quiero', 'necesito', 'puedo', 'podrías', 'dame',
      ];
      const words = cleanQuestion
        .toLowerCase()
        .replace(/[¿\?¡\!,\.\:\;\"\'\(\)\[\]]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopwords.includes(w) && isNaN(Number(w)));

      const keywords = [...new Set(words)].slice(0, 3);
      for (const kw of keywords) {
        searchData = await searchWiki(kw);
        if (searchData && searchData.total > 0) {
          usedFallback = true;
          break;
        }
      }
    }

    // Si aún no hay resultados, listar todas las páginas
    if (!searchData || searchData.total === 0) {
      const allPages = await listWikiPages();
      if (allPages.length === 0) {
        return NextResponse.json({
          answer: `No hay documentos cargados en el wiki. Cargá documentos PDF para poder responder preguntas.`,
          sources: [],
        });
      }
      // Cargar todas las páginas
      const docs: { title: string; content: string }[] = [];
      for (const pageSlug of allPages) {
        const page = await getPage(pageSlug);
        if (page) {
          docs.push({ title: page.title, content: page.content });
        }
      }
      if (docs.length === 0) {
        return NextResponse.json({
          answer: `No se pudieron cargar los documentos.`,
          sources: [],
        });
      }
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = buildPrompt(cleanQuestion, docs);
      const result = await model.generateContent(prompt);
      const answer = await result.response.text();

      return NextResponse.json({
        answer: answer,
        sources: docs.map((d) => ({ title: d.title, slug: '' })),
      });
    }

    // 3. Cargar contenido completo de los documentos encontrados
    const docs: { title: string; content: string }[] = [];
    for (const r of searchData.results.slice(0, 3)) {
      const page = await getPage(r.slug, r.folder);
      if (page) {
        docs.push({ title: page.title, content: page.content });
      }
    }

    if (docs.length === 0) {
      return NextResponse.json({
        answer: `No se pudo cargar el contenido de los documentos encontrados.`,
        sources: [],
      });
    }

    // 4. Enviar a Gemini con todo el contexto
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = buildPrompt(cleanQuestion, docs);
    const result = await model.generateContent(prompt);
    const answer = await result.response.text();

    // 5. Construir respuesta
    let responseAnswer = answer;
    if (usedFallback) {
      responseAnswer = `🔍 <em>Búsqueda para "<strong>${cleanQuestion}</strong>" (resultados relacionados):</em>\n\n${answer}`;
    }

    const sources = docs.map((d) => ({ title: d.title, slug: '' }));

    return NextResponse.json({
      answer: responseAnswer,
      sources,
    });
  } catch (err: any) {
    console.error('[/api/chat]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
