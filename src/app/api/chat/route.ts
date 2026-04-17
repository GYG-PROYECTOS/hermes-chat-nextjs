import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.HERMES_API_URL || 'http://85.31.230.163:3000';

interface SearchResult {
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
  results: SearchResult[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPreview(text: string): string {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  if (html.length > 800) {
    html = html.substring(0, 800) + '...';
  }
  return html;
}

function extractKeywords(text: string): string[] {
  const stopwords = [
    'de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un',
    'para', 'con', 'que', 'es', 'una', 'fue', 'como', 'pero', 'más', 'sus',
    'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy',
    'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde',
    'todo', 'nos', 'durante', 'si', 'no', 'solo', 'puede', 'qué', 'cómo',
    'cuál', 'dónde', 'cuándo', 'cuánto', 'explica', 'describe', 'dime',
    'habla', 'cuéntame', 'quiero', 'necesito', 'puedo', 'podrías', 'dame',
  ];
  const words = text
    .toLowerCase()
    .replace(/[¿\?¡\!,\.\:\;\"\'\(\)\[\]]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.includes(w) && isNaN(Number(w)));
  return [...new Set(words)].slice(0, 3);
}

async function searchWiki(query: string): Promise<HermesSearchResponse | null> {
  const url = `${API_BASE}/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Pregunta requerida' }, { status: 400 });
    }

    const cleanQuestion = question.trim();

    // 1. Buscar directamente
    let data = await searchWiki(cleanQuestion);

    // 2. Si no hay resultados, reintentar con keywords
    let usedFallback = false;
    if (!data || data.total === 0) {
      const keywords = extractKeywords(cleanQuestion);
      for (const kw of keywords) {
        data = await searchWiki(kw);
        if (data && data.total > 0) {
          usedFallback = true;
          break;
        }
      }
    }

    if (!data || data.total === 0) {
      return NextResponse.json({
        answer: `No encontré información sobre "<strong>${escapeHtml(cleanQuestion)}</strong>". Probá con otros términos o verificá que los documentos estén cargados.`,
        sources: [],
      });
    }

    const top = data.results[0];
    let answer = `<strong>📄 ${escapeHtml(top.title)}</strong>`;
    if (top.folder && top.folder !== 'root') {
      answer += ` <small>(📁 ${escapeHtml(top.folder)})</small>`;
    }
    answer += `<br><br>${formatPreview(top.preview)}`;

    // Si usó fallback, indicar
    if (usedFallback) {
      answer = `🔍 <em>Búsqueda para "<strong>${escapeHtml(cleanQuestion)}</strong>" (mostrando resultados relacionados):</em><br><br>${answer}`;
    }

    // Otros resultados como enlaces
    const sources = data.results.map((r) => ({ title: r.title, slug: r.slug }));
    if (data.results.length > 1) {
      const others = data.results
        .slice(1, 4)
        .map((r) => `<a href="#" onclick="window.dispatchEvent(new CustomEvent('hermes-ask',{detail:'${escapeHtml(r.title).replace(/'/g, "\\'")}'}))">${escapeHtml(r.title)}</a>`)
        .join(' · ');
      answer += `<br><br><small>📌 Otros: ${others}</small>`;
    }

    return NextResponse.json({ answer, sources });
  } catch (err: any) {
    console.error('[/api/chat]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
