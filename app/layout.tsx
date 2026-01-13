import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FED H.4.1 Dashboard',
  description: 'FED H.4.1 상세 대시보드 - PDF 파싱 및 분석',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
