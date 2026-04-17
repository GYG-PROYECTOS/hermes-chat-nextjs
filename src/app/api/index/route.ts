import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

interface WikiEntry {
  name: string;
  slug: string;
  title: string;
  type: 'file' | 'folder';
}

export async function GET() {
  try {
    const entries = fs.readdirSync(WIKI_PATH, { withFileTypes: true });
    const items: WikiEntry[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        items.push({
          name: entry.name,
          slug: entry.name,
          title: entry.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          type: 'folder',
        });
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
        items.push({
          name: entry.name,
          slug: entry.name.replace('.md', ''),
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
      total: items.length,
      items,
    });
  } catch (err: any) {
    console.error('[/api/index]', err);
    return NextResponse.json({ error: err.message, total: 0, items: [] }, { status: 500 });
  }
}
