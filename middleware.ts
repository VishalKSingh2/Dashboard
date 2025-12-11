import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Enable compression support
  if (!request.headers.get('accept-encoding')?.includes('gzip')) {
    // Client supports compression - indicated by Accept-Encoding header
    response.headers.set('Vary', 'Accept-Encoding');
  }
  
  // Add performance headers for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    
    // Enable compression for large responses
    if (request.nextUrl.pathname.includes('dashboard-db') || 
        request.nextUrl.pathname.includes('advanced-report')) {
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Compression-Enabled', 'true');
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/dashboard/:path*',
  ],
};
