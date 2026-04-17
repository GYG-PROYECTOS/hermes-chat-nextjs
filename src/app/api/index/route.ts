import { NextResponse } from 'next/server';

const API_BASE = process.env.HERMES_API_URL || 'http://85.31.230.163:3000';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/wiki/index`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: 'No se pudo obtener el índice' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
