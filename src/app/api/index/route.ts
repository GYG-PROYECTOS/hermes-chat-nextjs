import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WIKI_PATH = process.env.WIKI_PATH || '/var/hermes-data/wiki';

export async function GET() {
  try {
    const entries = fs.readdirSync(WIKI_PATH, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => ({
        name: e.name,
        slug: e.name.replace('.md', ''),
        title: e.name.replace('.md', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      }))
      .filter(f => f.slug !== 'index')
      .sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json({
      total: files.length,
      files,
    });
  } catch (err: any) {
    console.error('[/api/index]', err);
    return NextResponse.json({ error: err.message, total: 0, files: [] }, { status: 500 });
  }
}
