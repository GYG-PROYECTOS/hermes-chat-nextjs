import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

function safePath(base: string, filePath: string): string {
  const full = path.join(WIKI_PATH, base, filePath);
  if (!full.startsWith(WIKI_PATH)) throw new Error('Path fuera de wiki');
  return full;
}

// GET /api/wiki/file?path=carpeta/archivo.md
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path') || '';

  try {
    const fullPath = safePath('', filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }
}

// PUT /api/wiki/file?path=carpeta/archivo.md
export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path') || '';
  const { content } = await req.json();

  if (!filePath || content === undefined) {
    return NextResponse.json({ error: 'path y content requeridos' }, { status: 400 });
  }

  try {
    const fullPath = safePath('', filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');
    return NextResponse.json({ ok: true, path: filePath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/wiki/file?path=carpeta/archivo.md
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path') || '';

  if (!filePath) {
    return NextResponse.json({ error: 'path requerido' }, { status: 400 });
  }

  try {
    const fullPath = safePath('', filePath);
    fs.unlinkSync(fullPath);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
