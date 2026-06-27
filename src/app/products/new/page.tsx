import { ProductForm } from "@/components/ProductForm";

export default function NewProductPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-6 py-8">
        <ProductForm />
      </main>
    </div>
  );
}
