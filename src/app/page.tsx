import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Buzz</h1>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/products"
            className="p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 transition-colors"
          >
            <h3 className="font-medium text-gray-900">Products</h3>
            <p className="text-sm text-gray-500 mt-1">Manage products to market</p>
          </Link>

          <Link
            href="/generate"
            className="p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 transition-colors"
          >
            <h3 className="font-medium text-gray-900">Generate</h3>
            <p className="text-sm text-gray-500 mt-1">Create new content with AI</p>
          </Link>

          <Link
            href="/content"
            className="p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 transition-colors"
          >
            <h3 className="font-medium text-gray-900">Content Queue</h3>
            <p className="text-sm text-gray-500 mt-1">Review and approve posts</p>
          </Link>

          <Link
            href="/settings"
            className="p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 transition-colors"
          >
            <h3 className="font-medium text-gray-900">Settings</h3>
            <p className="text-sm text-gray-500 mt-1">Connect Instagram account</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
