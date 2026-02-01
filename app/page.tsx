import { redirect } from "next/navigation";

/**
 * 루트(/) 접속 시 대시보드로 리다이렉트.
 * Vercel에서 Next.js가 루트를 먼저 처리해 404가 나지 않도록 함.
 */
export default function RootPage() {
  redirect("/dashboard");
}
