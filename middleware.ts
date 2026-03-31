import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`)
);

async function verifyBearerToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.KEYCLOAK_ISSUER,
    });
    return payload;
  } catch {
    return null;
  }
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  // Allow auth routes to pass through
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // For API routes: check Bearer token first, then session
  if (pathname.startsWith('/api')) {
    const authHeader = req.headers.get('authorization');

    // If Bearer token is provided, validate it
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = await verifyBearerToken(token);
      if (payload) {
        return NextResponse.next();
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Fall back to session-based auth (browser requests)
    if (!req.auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.next();
  }

  // For page routes: redirect to sign in
  if (!req.auth) {
    const signInUrl = new URL('/api/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/api/:path*',
    '/dashboard/:path*',
    '/report-jobs/:path*',
  ],
};
