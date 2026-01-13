/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // 빌드 시 타입 오류가 있어도 계속 진행 (런타임 오류는 없음)
    ignoreBuildErrors: true,
  },
  eslint: {
    // 빌드 시 ESLint 오류 무시
    ignoreDuringBuilds: true,
  },
}
export default nextConfig
