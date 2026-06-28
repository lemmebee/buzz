"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Product, ContentItem } from "../../../../drizzle/schema";
import { ProductForm } from "@/components/ProductForm";
import { JsonToMarkdown } from "@/components/JsonToMarkdown";
import { RevisionHistory } from "@/components/RevisionHistory";
import { ContentCard } from "@/components/ContentCard";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ConfirmDialog, useConfirm } from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/Skeleton";
import type { BrainstormIdea } from "@/lib/brain/types";
import {
  ArrowLeft,
  FileText,
  Brain,
  Inbox,
  Lightbulb,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  Search,
} from "lucide-react";

type Tab = "overview" | "brief" | "intelligence" | "ideas" | "content";

const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "brief", label: "Brief", icon: FileText },
  { id: "intelligence", label: "Intelligence", icon: Brain },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
  { id: "content", label: "Content", icon: Inbox },
];

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n/, "");
}

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { confirm, close, isOpen, title, description, onConfirm, variant } = useConfirm();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);

  useEffect(() => {
    fetchProduct();
  }, [id]);

  useEffect(() => {
    if (product?.extractionStatus === "pending" || product?.extractionStatus === "extracting") {
      const interval = setInterval(fetchProduct, 2000);
      return () => clearInterval(interval);
    }
  }, [product?.extractionStatus]);

  async function fetchProduct() {
    const res = await fetch(`/api/products/${id}`);
    if (!res.ok) {
      router.push("/products");
      return;
    }
    const data = await res.json();
    setProduct(data);
    setLoading(false);
  }

  async function handleReExtract() {
    setReExtracting(true);
    try {
      const res = await fetch(`/api/products/${id}/re-extract`, { method: "POST" });
      if (res.ok) {
        toast.info("Re-extraction started");
        await fetchProduct();
      } else {
        const data = await res.json();
        toast.error(data.error || "Re-extraction failed");
      }
    } finally {
      setReExtracting(false);
    }
  }

  async function handleDelete() {
    confirm("Delete Product", "Are you sure? This will also delete all associated content.", async () => {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Product deleted");
        router.push("/products");
      } else {
        toast.error("Failed to delete product");
      }
    }, "destructive");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-6 flex items-center gap-4">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-10 w-full mb-6" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-tertiary mb-4">Product not found</p>
          <Link href="/products" className="text-primary hover:text-primary-hover">
            Back to products
          </Link>
        </div>
      </div>
    );
  }

  const isExtracting = product.extractionStatus === "pending" || product.extractionStatus === "extracting";

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/products"
            className="text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold text-text-primary flex-1 truncate">
            {product.name}
          </h1>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-border transition-colors"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-1 w-40 bg-surface border border-border rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={() => { setEditing(true); setActiveTab("overview"); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-background"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => { handleReExtract(); setMenuOpen(false); }}
                    disabled={reExtracting || isExtracting}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-background disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Re-extract
                  </button>
                  <button
                    onClick={() => { handleDelete(); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-error hover:bg-background"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab Content */}
        {activeTab === "overview" && (
          <OverviewTab
            product={product}
            editing={editing}
            onEdit={setEditing}
          />
        )}
        {activeTab === "brief" && <BriefTab product={product} />}
        {activeTab === "intelligence" && (
          <IntelligenceTab product={product} onUpdate={setProduct} />
        )}
        {activeTab === "ideas" && <IdeasTab product={product} />}
        {activeTab === "content" && <ContentTab productId={product.id} />}
      </main>
      <ConfirmDialog isOpen={isOpen} onClose={close} onConfirm={onConfirm} title={title} description={description} variant={variant} />
    </div>
  );
}

function TabBar({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (tab: Tab) => void }) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    let newIndex = index;
    if (e.key === "ArrowRight") {
      newIndex = (index + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      newIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      newIndex = 0;
    } else if (e.key === "End") {
      newIndex = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    tabRefs.current[newIndex]?.focus();
    onTabChange(tabs[newIndex].id);
  }

  return (
    <div className="border-b border-border mb-6" role="tablist">
      <div className="flex gap-1">
        {tabs.map((tab, index) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-strong"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverviewTab({
  product,
  editing,
  onEdit,
}: {
  product: Product;
  editing: boolean;
  onEdit: (editing: boolean) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const screenshots: string[] = product.screenshots ? JSON.parse(product.screenshots) : [];

  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary">Edit Product</h2>
          <button
            onClick={() => onEdit(false)}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
        <ProductForm product={product} />
      </div>
    );
  }

  const audience = product.profile ? JSON.parse(product.profile)?.audience : null;

  return (
    <div className="space-y-6">
      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        {product.extractionStatus && (
          <StatusBadge
            status={product.extractionStatus}
            labels={{ pending: "Pending", extracting: "Extracting", done: "Extracted", failed: "Failed" }}
            colors={{
              pending: "bg-warning-bg text-warning",
              extracting: "bg-warning-bg text-warning animate-pulse",
              done: "bg-success-bg text-success",
              failed: "bg-error-bg text-error",
            }}
          />
        )}
        {product.textProvider && (
          <span className="text-xs px-2 py-1 bg-primary/15 text-primary rounded">
            {product.textProvider}
          </span>
        )}
        {product.instagramAccountId && (
          <span className="text-xs px-2 py-1 bg-info-bg text-info rounded">
            Instagram linked
          </span>
        )}
      </div>

      {/* Description */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-2">Description</h3>
        <div className="prose prose-sm max-w-none prose-headings:text-text-primary prose-headings:mt-4 prose-headings:mb-2 prose-p:text-text-primary prose-p:my-2 prose-li:text-text-primary prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2 prose-strong:text-text-primary prose-code:text-text-primary prose-code:bg-border prose-code:px-1 prose-code:rounded prose-pre:bg-border prose-pre:text-text-primary prose-pre:my-3 prose-blockquote:text-text-primary prose-blockquote:border-l-2 prose-blockquote:border-border-strong prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-4 prose-a:text-primary prose-a:underline prose-a:hover:text-primary-hover">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(product.description)}</ReactMarkdown>
        </div>
      </div>

      {/* Audience */}
      {audience && (
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-2">Audience</h3>
          <div className="space-y-2 text-sm">
            {audience.primary && (
              <p className="text-text-primary">
                <span className="text-text-tertiary">Primary:</span> {audience.primary}
              </p>
            )}
            {audience.demographics && (
              <p className="text-text-primary">
                <span className="text-text-tertiary">Demographics:</span> {audience.demographics}
              </p>
            )}
            {audience.psychographics && (
              <p className="text-text-primary">
                <span className="text-text-tertiary">Psychographics:</span> {audience.psychographics}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Screenshots preview */}
      {screenshots.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-2">
            Screenshots ({screenshots.length})
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {screenshots.slice(0, 4).map((path, i) => (
              <div
                key={i}
                className="relative group cursor-pointer"
                onClick={() => setLightboxIndex(i)}
              >
                <img
                  src={path}
                  alt=""
                  className="w-full aspect-square object-cover rounded-lg border border-border group-hover:border-border-strong transition-colors"
                />
              </div>
            ))}
          </div>
          {screenshots.length > 4 && (
            <p className="text-xs text-text-tertiary mt-2">
              +{screenshots.length - 4} more in Brief tab
            </p>
          )}
        </div>
      )}

      {lightboxIndex !== null && (
        <ImageLightbox
          src={screenshots[lightboxIndex]}
          images={screenshots}
          currentIndex={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Quick actions */}
      <div className="pt-4 border-t border-border">
        <div className="flex gap-3">
          <Link
            href="/generate"
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors"
          >
            Generate Content
          </Link>
        </div>
      </div>
    </div>
  );
}

function BriefTab({ product }: { product: Product }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const screenshots: string[] = product.screenshots ? JSON.parse(product.screenshots) : [];

  return (
    <div className="space-y-8">
      {/* Plan file */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">Plan File</h3>
        {product.planFile ? (
          <div className="bg-surface rounded-lg border border-border p-6">
            {product.planFileName && (
              <p className="text-xs text-text-tertiary mb-4">{product.planFileName}</p>
            )}
            <div className="prose prose-sm max-w-none prose-headings:text-text-primary prose-headings:mt-4 prose-headings:mb-2 prose-p:text-text-secondary prose-p:my-2 prose-li:text-text-secondary prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2 prose-strong:text-text-primary prose-code:text-text-primary prose-code:bg-border prose-code:px-1 prose-code:rounded prose-pre:bg-border prose-pre:text-text-primary prose-pre:my-3 prose-blockquote:text-text-primary prose-blockquote:border-l-2 prose-blockquote:border-border-strong prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-4 prose-a:text-primary prose-a:underline prose-a:hover:text-primary-hover">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(product.planFile || "")}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded-lg border border-border p-8 text-center">
            <p className="text-sm text-text-tertiary mb-2">No plan file uploaded</p>
            <Link href={`/products/${product.id}`} className="text-sm text-primary hover:text-primary-hover">
              Edit product to upload a plan file
            </Link>
          </div>
        )}
      </div>

      {/* Screenshots */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">
          Screenshots ({screenshots.length})
        </h3>
        {screenshots.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {screenshots.map((path, i) => (
              <div key={i} className="relative group cursor-pointer" onClick={() => setLightboxIndex(i)}>
                <img
                  src={path}
                  alt=""
                  className="w-full aspect-square object-cover rounded-lg border border-border group-hover:border-border-strong transition-colors"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface rounded-lg border border-border p-8 text-center">
            <p className="text-sm text-text-tertiary">No screenshots uploaded</p>
          </div>
        )}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          src={screenshots[lightboxIndex]}
          images={screenshots}
          currentIndex={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

function IntelligenceTab({ product, onUpdate }: { product: Product; onUpdate: (p: Product) => void }) {
  const [showProfileHistory, setShowProfileHistory] = useState(false);
  const [showStrategyHistory, setShowStrategyHistory] = useState(false);

  const profile = product.profile ? JSON.parse(product.profile) : null;
  const strategy = product.marketingStrategy ? JSON.parse(product.marketingStrategy) : null;
  const isExtracting = product.extractionStatus === "pending" || product.extractionStatus === "extracting";

  return (
    <div className="space-y-8">
      {/* Extraction status */}
      {isExtracting && (
        <div className="bg-warning-bg border border-warning/20 rounded-lg p-4 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 text-warning animate-spin" />
          <p className="text-sm text-warning">Extracting profile and strategy...</p>
        </div>
      )}

      {/* Profile */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-text-secondary">Product Profile</h3>
          <button
            onClick={() => setShowProfileHistory(!showProfileHistory)}
            className="text-xs text-text-tertiary hover:text-text-secondary"
          >
            {showProfileHistory ? "Current" : "History"}
          </button>
        </div>
        <div className="bg-surface rounded-lg border border-border p-6">
          {showProfileHistory ? (
            <RevisionHistory
              productId={product.id}
              field="profile"
              renderContent={(content) => {
                try {
                  return <JsonToMarkdown data={JSON.parse(content)} />;
                } catch {
                  return <p className="text-sm text-text-tertiary">Invalid data</p>;
                }
              }}
              onRevert={onUpdate}
            />
          ) : profile ? (
            <JsonToMarkdown data={profile} />
          ) : (
            <p className="text-sm text-text-tertiary">No profile extracted yet</p>
          )}
        </div>
      </div>

      {/* Strategy */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-text-secondary">Marketing Strategy</h3>
          <button
            onClick={() => setShowStrategyHistory(!showStrategyHistory)}
            className="text-xs text-text-tertiary hover:text-text-secondary"
          >
            {showStrategyHistory ? "Current" : "History"}
          </button>
        </div>
        <div className="bg-surface rounded-lg border border-border p-6">
          {showStrategyHistory ? (
            <RevisionHistory
              productId={product.id}
              field="marketingStrategy"
              renderContent={(content) => {
                try {
                  return <JsonToMarkdown data={JSON.parse(content)} />;
                } catch {
                  return <p className="text-sm text-text-tertiary">Invalid data</p>;
                }
              }}
              onRevert={onUpdate}
            />
          ) : strategy ? (
            <JsonToMarkdown data={strategy} />
          ) : (
            <p className="text-sm text-text-tertiary">No strategy extracted yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

type SavedIdea = BrainstormIdea & { id: number; theme?: string | null; createdAt?: string | null };

const KIND_STYLES: Record<string, string> = {
  campaign: "bg-info-bg text-info",
  series: "bg-primary/15 text-primary",
  post: "bg-success-bg text-success",
  experiment: "bg-warning-bg text-warning",
};

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-text-tertiary">
      {label}
      <span className="font-medium text-text-secondary">{value}/5</span>
    </span>
  );
}

function IdeaCard({ idea, onDelete }: { idea: SavedIdea; onDelete: (id: number) => void }) {
  return (
    <div className="bg-surface rounded-lg border border-border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-base font-semibold text-text-primary">{idea.title}</h4>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded capitalize ${KIND_STYLES[idea.kind] || "bg-border text-text-secondary"}`}>
            {idea.kind}
          </span>
          <button
            onClick={() => onDelete(idea.id)}
            title="Delete idea"
            className="text-text-tertiary hover:text-error transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-base text-text-primary italic">&ldquo;{idea.hook}&rdquo;</p>
      {idea.whyItWorks && (
        <p className="text-sm text-text-secondary">
          <span className="text-text-tertiary">Why it works: </span>{idea.whyItWorks}
        </p>
      )}
      {idea.format && (
        <p className="text-sm text-text-secondary">
          <span className="text-text-tertiary">Format: </span>{idea.format}
        </p>
      )}
      {idea.riskiestAssumption && (
        <p className="text-sm text-text-secondary">
          <span className="text-text-tertiary">Riskiest assumption: </span>{idea.riskiestAssumption}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs">
        <ScorePill label="Novelty" value={idea.scores.novelty} />
        <ScorePill label="Fit" value={idea.scores.fit} />
        <ScorePill label="Feasibility" value={idea.scores.feasibility} />
        {idea.theme && <span className="text-text-tertiary">focus: {idea.theme}</span>}
        {idea.createdAt && (
          <span className="text-text-tertiary ml-auto">{new Date(idea.createdAt).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}

function IdeasTab({ product }: { product: Product }) {
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [theme, setTheme] = useState("");

  const hasStrategy = !!(product.profile && product.marketingStrategy);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/products/${product.id}/brainstorm`);
        if (active && res.ok) {
          const data = await res.json();
          setIdeas(data.ideas || []);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [product.id]);

  async function handleBrainstorm() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/products/${product.id}/brainstorm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 8, theme: theme.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        const fresh: SavedIdea[] = data.ideas || [];
        setIdeas((prev) => [...fresh, ...prev]);
        toast.success(fresh.length ? `Saved ${fresh.length} new ideas` : "No ideas returned, try again");
      } else {
        toast.error(data.error || "Brainstorm failed");
      }
    } catch {
      toast.error("Brainstorm failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(ideaId: number) {
    const res = await fetch(`/api/products/${product.id}/brainstorm?ideaId=${ideaId}`, { method: "DELETE" });
    if (res.ok) {
      setIdeas((prev) => prev.filter((i) => i.id !== ideaId));
    } else {
      toast.error("Failed to delete idea");
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Optional focus (e.g. launch week, a specific segment)"
          onKeyDown={(e) => { if (e.key === "Enter" && hasStrategy && !generating) handleBrainstorm(); }}
          className="flex-1 rounded-md border border-border bg-surface py-2 px-3 text-base text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleBrainstorm}
          disabled={generating || !hasStrategy}
          title={!hasStrategy ? "Extract a profile and strategy first" : undefined}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        >
          {generating ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Brainstorming...</>
          ) : (
            <><Lightbulb className="h-4 w-4" /> Brainstorm ideas</>
          )}
        </button>
      </div>

      {!hasStrategy && (
        <p className="text-sm text-text-tertiary">
          Brainstorming uses this product&apos;s profile and strategy. Extract them on the Intelligence tab to generate new ideas. Saved ideas still show below.
        </p>
      )}

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : ideas.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onDelete={handleDelete} />)}
        </div>
      ) : (
        <div className="bg-surface rounded-lg border border-border p-8 text-center">
          <Lightbulb className="h-6 w-6 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-tertiary">
            {generating
              ? "Brainstorming ideas..."
              : "No ideas yet. Generate innovative campaign, series, post, and experiment ideas from this product's profile and strategy."}
          </p>
        </div>
      )}
    </div>
  );
}

function ContentTab({ productId }: { productId: number }) {
  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const statuses = ["all", "draft", "approved", "scheduled", "posted"] as const;

  useEffect(() => {
    fetchPosts();
  }, [productId, statusFilter]);

  async function fetchPosts() {
    setLoading(true);
    const url = statusFilter === "all"
      ? `/api/posts?productId=${productId}`
      : `/api/posts?productId=${productId}&status=${statusFilter}`;
    const res = await fetch(url);
    if (res.ok) {
      setPosts(await res.json());
    }
    setLoading(false);
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPosts(posts.filter((p) => p.id !== id));
      toast.success("Post deleted");
    }
  }

  async function handleStatusChange(id: number, status: string) {
    const body: Record<string, unknown> = { status };
    if (status !== "scheduled") body.scheduledAt = null;
    const res = await fetch(`/api/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setPosts(posts.map((p) => p.id === id ? { ...p, status } : p));
      toast.success("Status updated");
    }
  }

  const filteredPosts = posts.filter((p) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const content = p.content?.toLowerCase() || "";
    return content.includes(query);
  });

  const statusCounts = {
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    approved: posts.filter((p) => p.status === "approved").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    posted: posts.filter((p) => p.status === "posted").length,
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex gap-2">
          {statuses.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-sm rounded-lg capitalize flex items-center gap-1.5 ${
                statusFilter === status
                  ? "bg-primary text-white"
                  : "bg-surface text-text-secondary border border-border hover:border-border-strong"
              }`}
            >
              {status}
              <span className={`text-xs ${statusFilter === status ? "text-white/70" : "text-text-tertiary"}`}>
                {statusCounts[status]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="bg-surface rounded-lg border border-border p-12 text-center">
          {posts.length === 0 ? (
            <>
              <p className="text-text-tertiary mb-4">No content generated yet</p>
              <Link href="/generate" className="text-primary hover:text-primary-hover">
                Generate your first content
              </Link>
            </>
          ) : (
            <p className="text-text-tertiary">No content matches your filters</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPosts.map((post) => (
            <ContentCard
              key={post.id}
              post={post}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  labels,
  colors,
}: {
  status: string;
  labels: Record<string, string>;
  colors: Record<string, string>;
}) {
  return (
    <span className={`text-xs px-2 py-1 rounded ${colors[status] || "bg-border text-text-secondary"}`}>
      {labels[status] || status}
    </span>
  );
}
