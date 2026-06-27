import Link from "next/link";
import { ProductForm } from "@/components/ProductForm";

export default function NewProductPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/products" className="text-text-tertiary hover:text-text-secondary">←</Link>
          <h1 className="text-xl font-bold text-text-primary">New Product</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <ProductForm />
      </main>
    </div>
  );
}
