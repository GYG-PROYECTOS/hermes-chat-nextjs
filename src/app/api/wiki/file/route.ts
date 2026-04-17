import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

// GET /api/wiki/file?path=carpeta/archivo.md
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'path requerido' }, { status: 400 });
  }

  const safePath = path.join(WIKI_PATH, filePath);

  if (!safePath.startsWith(WIKI_PATH)) {
    return NextResponse.json({ error: 'Path fuera de wiki' }, { status: 403 });
  }

  try {
    const content = fs.readFileSync(safePath, 'utf-8');
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }
}

// PUT /api/wiki/file?path=carpeta/archivo.md
export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path');
  const { content } = await req.json();

  if (!filePath || content === undefined) {
    return NextResponse.json({ error: 'path y content requeridos' }, { status: 400 });
  }

  const safePath = path.join(WIKI_PATH, filePath);

  if (!safePath.startsWith(WIKI_PATH)) {
    return NextResponse.json({ error: 'Path fuera de wiki' }, { status: 403 });
  }

  try {
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(safePath, content, 'utf-8');
    return NextResponse.json({ ok: true, path: filePath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/wiki/file?path=carpeta/archivo.md
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'path requerido' }, { status: 400 });
  }

  const safePath = path.join(WIKI_PATH, filePath);

  if (!safePath.startsWith(WIKI_PATH)) {
    return NextResponse.json({ error: 'Path fuera de wiki' }, { status: 403 });
  }

  try {
    fs.unlinkSync(safePath);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
