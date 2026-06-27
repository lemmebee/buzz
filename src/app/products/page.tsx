"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ProductCard } from "@/components/ProductCard";
import { ConfirmDialog, useConfirm } from "@/components/ConfirmDialog";
import { Product } from "../../../drizzle/schema";

export default function ProductsPage() {
  const { confirm, close, isOpen, title, description, onConfirm, variant } = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data);
    setLoading(false);
  }

  async function handleDelete(id: number) {
    confirm("Delete Product", "Are you sure you want to delete this product?", async () => {
      await fetch(`/api/products/${id}`, { method: "DELETE" });
      setProducts(products.filter((p) => p.id !== id));
      toast.success("Product deleted");
    }, "destructive");
  }

  function handleUpdate(updated: Product) {
    setProducts(products.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-6 py-8">
        {loading ? (
          <p className="text-text-tertiary">Loading...</p>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-tertiary mb-4">No products yet</p>
            <Link
              href="/products/new"
              className="text-primary hover:text-primary-hover"
            >
              Add your first product
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        )}
      </main>
      <ConfirmDialog isOpen={isOpen} onClose={close} onConfirm={onConfirm} title={title} description={description} variant={variant} />
    </div>
  );
}
