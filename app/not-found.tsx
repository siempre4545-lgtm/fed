import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 max-w-md w-full text-center">
        <h2 className="text-2xl font-bold mb-4">404</h2>
        <p className="text-gray-300 mb-6">페이지를 찾을 수 없습니다.</p>
        <Link
          href="/fed-dashboard"
          className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium"
        >
          대시보드로 이동
        </Link>
      </div>
    </div>
  );
}
