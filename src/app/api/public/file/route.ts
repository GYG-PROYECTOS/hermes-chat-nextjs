import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

function checkToken(token: string | null): boolean {
  const publicToken = process.env.PUBLIC_TOKEN;
  if (!publicToken) return true;
  return token === publicToken;
}

function safePath(filePath: string): string {
  const full = path.join(WIKI_PATH, filePath);
  if (!full.startsWith(WIKI_PATH)) throw new Error('Path fuera de wiki');
  return full;
}

// GET /api/public/file?path=X
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!checkToken(token)) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  const filePath = req.nextUrl.searchParams.get('path') || '';
  try {
    const fullPath = safePath(filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }
}

// PUT /api/public/file?path=X
export async function PUT(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!checkToken(token)) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  const filePath = req.nextUrl.searchParams.get('path') || '';
  const { content } = await req.json();
  if (!filePath || content === undefined) return NextResponse.json({ error: 'path y content requeridos' }, { status: 400 });
  try {
    const fullPath = safePath(filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return NextResponse.json({ ok: true, path: filePath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/public/file?path=X
export async function DELETE(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!checkToken(token)) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  const filePath = req.nextUrl.searchParams.get('path') || '';
  if (!filePath) return NextResponse.json({ error: 'path requerido' }, { status: 400 });
  try {
    const fullPath = safePath(filePath);
    fs.unlinkSync(fullPath);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
