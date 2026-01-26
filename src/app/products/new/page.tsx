import Link from "next/link";
import { ProductForm } from "@/components/ProductForm";

export default function NewProductPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/products" className="text-gray-500 hover:text-gray-700">←</Link>
          <h1 className="text-xl font-bold text-gray-900">New Product</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <ProductForm />
      </main>
    </div>
  );
}
