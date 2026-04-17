import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

interface WikiEntry {
  name: string;
  slug: string;
  title: string;
  type: 'file' | 'folder';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const basePath = searchParams.get('path') || '';
  const targetPath = path.join(WIKI_PATH, basePath);

  if (!targetPath.startsWith(WIKI_PATH)) {
    return NextResponse.json({ error: 'Path fuera de wiki' }, { status: 403 });
  }

  try {
    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ error: 'Carpeta no existe' }, { status: 404 });
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const items: WikiEntry[] = [];

    for (const entry of entries) {
      const fullPath = path.join(basePath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        items.push({
          name: fullPath,
          slug: fullPath,
          title: entry.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          type: 'folder',
        });
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
        items.push({
          name: fullPath,
          slug: fullPath.replace('.md', ''),
          title: entry.name.replace('.md', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          type: 'file',
        });
      }
    }

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    return NextResponse.json({
      path: basePath,
      total: items.length,
      items,
    });
  } catch (err: any) {
    console.error('[/api/index]', err);
    return NextResponse.json({ error: err.message, path: basePath, total: 0, items: [] }, { status: 500 });
  }
}
