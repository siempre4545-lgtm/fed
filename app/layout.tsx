import type { ReactNode } from 'react';

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: '#0b0f14', color: '#e6edf3' }}>{children}</body>
    </html>
  );
};

export default RootLayout;
