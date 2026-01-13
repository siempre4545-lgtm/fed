import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Next.js 라우트는 그대로 통과 (아무것도 하지 않음)
  // Vercel이 자동으로 Next.js 라우트를 처리하므로 middleware에서 가로채지 않음
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Next.js 라우트는 제외하고, Express 라우트만 처리
    // 실제로는 Next.js가 자동으로 처리되므로 여기서는 아무것도 하지 않음
  ],
};
