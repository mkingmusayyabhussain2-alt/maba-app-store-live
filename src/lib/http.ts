/**
 * Small JSON helpers for route handlers — keeps Roman Urdu error messages
 * consistent: every error is { error: "<Roman Urdu message>" }.
 */
import { NextResponse } from 'next/server';

export function ok<T extends Record<string, unknown>>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function err(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Catch-all for unexpected failures. Never leaks internals to the client. */
export function serverError(e: unknown): NextResponse {
  console.error('[api] unexpected error:', e);
  return err('Server mein masla aa gaya. Thodi der baad dobara koshish karen.', 500);
}
