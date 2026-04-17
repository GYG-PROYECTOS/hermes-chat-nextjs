import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

function checkToken(token: string | null): boolean {
  const publicToken = process.env.PUBLIC_TOKEN;
  if (!publicToken) return true;
  return token === publicToken;
}

function safePath(name: string): string {
  const full = path.join(WIKI_PATH, name);
  if (!full.startsWith(WIKI_PATH)) throw new Error('Path fuera de wiki');
  return full;
}

// POST /api/public/folder
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!checkToken(token)) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400 });
  try {
    const fullPath = safePath(name);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    return NextResponse.json({ ok: true, path: name });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/public/folder?name=X
export async function DELETE(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!checkToken(token)) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  const name = req.nextUrl.searchParams.get('name') || '';
  if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400 });
  try {
    const fullPath = safePath(name);
    if (fs.existsSync(fullPath)) {
      const entries = fs.readdirSync(fullPath);
      if (entries.length > 0) return NextResponse.json({ error: 'Carpeta no vacía' }, { status: 400 });
      fs.rmdirSync(fullPath);
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
