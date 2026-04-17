import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

function safePath(filePath: string): string {
  const full = path.join(WIKI_PATH, filePath);
  if (!full.startsWith(WIKI_PATH)) throw new Error('Path fuera de wiki');
  return full;
}

// POST /api/wiki/upload
// multipart/form-data con campo "file" y opcional "folder" path
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string || '';

    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Solo archivos PDF' }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._-]/g, '_');
    const destFolder = folder ? path.join(WIKI_PATH, folder) : WIKI_PATH;

    if (!fs.existsSync(destFolder)) {
      fs.mkdirSync(destFolder, { recursive: true });
    }

    const destPath = path.join(destFolder, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    const savedAs = folder ? `${folder}/${safeName}` : safeName;

    return NextResponse.json({
      ok: true,
      name: safeName,
      path: savedAs,
      size: file.size,
      message: `PDF guardado en ${savedAs}`,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
