import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

// POST /api/wiki/folder - crear carpeta
export async function POST(req: NextRequest) {
  const { name } = await req.json();

  if (!name) {
    return NextResponse.json({ error: 'name requerido' }, { status: 400 });
  }

  const folderPath = path.join(WIKI_PATH, name);
  if (!folderPath.startsWith(WIKI_PATH)) {
    return NextResponse.json({ error: 'Path fuera de wiki' }, { status: 403 });
  }

  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    return NextResponse.json({ ok: true, path: name });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/wiki/folder?name=carpeta
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');

  if (!name) {
    return NextResponse.json({ error: 'name requerido' }, { status: 400 });
  }

  const folderPath = path.join(WIKI_PATH, name);
  if (!folderPath.startsWith(WIKI_PATH)) {
    return NextResponse.json({ error: 'Path fuera de wiki' }, { status: 403 });
  }

  try {
    if (fs.existsSync(folderPath)) {
      const entries = fs.readdirSync(folderPath);
      if (entries.length > 0) {
        return NextResponse.json({ error: 'Carpeta no vacia' }, { status: 400 });
      }
      fs.rmdirSync(folderPath);
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
