"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Product } from "../../drizzle/schema";

interface ProductFormProps {
  product?: Product;
}

export function ProductForm({ product }: ProductFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState(product?.extractionStatus || null);

  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [planFile, setPlanFile] = useState(product?.planFile || "");
  const [planFileName, setPlanFileName] = useState(product?.planFileName || "");
  const [llmInstructions, setLlmInstructions] = useState(product?.llmInstructions || "");
  const [textProvider, setTextProvider] = useState(() => {
    const tp = product?.textProvider || "gemini";
    if (tp.startsWith("antigravity")) return "antigravity";
    if (tp.startsWith("claude-code")) return "claude-code";
    return tp;
  });
  const [imageProvider, setImageProvider] = useState(product?.imageProvider || "");
  const [antigravityModel, setAntigravityModel] = useState(() => {
    const tp = product?.textProvider || "";
    return tp.startsWith("antigravity:") ? tp.split(":").slice(1).join(":") : "";
  });
  const [antigravityModels, setAntigravityModels] = useState<string[]>([]);
  const [claudeCodeModel, setClaudeCodeModel] = useState(() => {
    const tp = product?.textProvider || "";
    return tp.startsWith("claude-code:") ? tp.split(":").slice(1).join(":") : "";
  });
  const [claudeCodeModels, setClaudeCodeModels] = useState<string[]>([]);

  // Screenshots: existing paths from DB + new files to upload
  const [existingScreenshots, setExistingScreenshots] = useState<string[]>(
    product?.screenshots ? JSON.parse(product.screenshots) : []
  );
  const [newScreenshots, setNewScreenshots] = useState<File[]>([]);
  const [newScreenshotPreviews, setNewScreenshotPreviews] = useState<string[]>([]);

  const [existingLogo, setExistingLogo] = useState<string | null>(product?.logo || null);
  const [newLogo, setNewLogo] = useState<File | null>(null);
  const [newLogoPreview, setNewLogoPreview] = useState<string | null>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setPlanFile(text);
    setPlanFileName(file.name);

    // Auto-populate fields from plan file content
    autoPopulateFromPlan(text, name, description);
  }

  function autoPopulateFromPlan(content: string, currentName: string, currentDescription: string) {
    const cleanContent = content.replace(/^---\n[\s\S]*?\n---\n/, "");
    const lines = cleanContent.split("\n");

    // Only auto-populate name if empty (new product)
    if (!currentName.trim()) {
      const titleMatch = cleanContent.match(/^#+\s+(.+)$/m);
      if (titleMatch) {
        setName(titleMatch[1].trim());
      }
    }

    // Only auto-populate description if empty
    if (!currentDescription.trim()) {
      let foundTitle = false;
      const descLines: string[] = [];
      for (const line of lines) {
        if (line.match(/^#+\s/)) {
          if (foundTitle && descLines.length > 0) break;
          foundTitle = true;
          continue;
        }
        if (foundTitle && line.trim() && !line.startsWith("-") && !line.startsWith("*") && !line.startsWith("|")) {
          descLines.push(line.trim());
        } else if (foundTitle && descLines.length > 0 && !line.trim()) {
          break;
        }
      }
      if (descLines.length > 0) {
        setDescription(descLines.join(" "));
      }
    }
  }

  function handleRemoveFile() {
    setPlanFile("");
    setPlanFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleScreenshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setNewScreenshots((prev) => [...prev, ...files]);
    const previews = files.map((f) => URL.createObjectURL(f));
    setNewScreenshotPreviews((prev) => [...prev, ...previews]);
    if (screenshotInputRef.current) screenshotInputRef.current.value = "";
  }

  function removeExistingScreenshot(index: number) {
    setExistingScreenshots((prev) => prev.filter((_, i) => i !== index));
  }

  function removeNewScreenshot(index: number) {
    URL.revokeObjectURL(newScreenshotPreviews[index]);
    setNewScreenshots((prev) => prev.filter((_, i) => i !== index));
    setNewScreenshotPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (newLogoPreview) URL.revokeObjectURL(newLogoPreview);
    setNewLogo(file);
    setNewLogoPreview(URL.createObjectURL(file));
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  function removeLogo() {
    if (newLogoPreview) URL.revokeObjectURL(newLogoPreview);
    setNewLogo(null);
    setNewLogoPreview(null);
    setExistingLogo(null);
  }

  async function handleReExtract() {
    if (!product) return;
    setReExtracting(true);
    setExtractionStatus("extracting");
    try {
      const res = await fetch(`/api/products/${product.id}/re-extract`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Re-extraction failed");
        setExtractionStatus("failed");
        setReExtracting(false);
        return;
      }
      // Poll for completion
      const poll = setInterval(async () => {
        const r = await fetch(`/api/products/${product.id}`);
        if (r.ok) {
          const p = await r.json();
          setExtractionStatus(p.extractionStatus);
          if (p.extractionStatus === "done" || p.extractionStatus === "failed") {
            clearInterval(poll);
            setReExtracting(false);
          }
        }
      }, 2000);
    } catch {
      setExtractionStatus("failed");
      setReExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const data = {
      name,
      description,
      planFile: planFile || null,
      planFileName: planFileName || null,
      llmInstructions: llmInstructions || null,
      textProvider: textProvider === "antigravity"
        ? (antigravityModel ? `antigravity:${antigravityModel}` : "antigravity")
        : textProvider === "claude-code"
        ? (claudeCodeModel ? `claude-code:${claudeCodeModel}` : "claude-code")
        : (textProvider || null),
      imageProvider: imageProvider || null,
      replaceScreenshots: true,
    };

    const useFormData = newScreenshots.length > 0 || newLogo !== null || existingLogo !== (product?.logo || null) || existingScreenshots.length !== (product?.screenshots ? JSON.parse(product.screenshots).length : 0);

    let res: Response;

    if (useFormData) {
      const formData = new FormData();
      formData.append("data", JSON.stringify({ ...data, existingScreenshots, removeLogo: existingLogo === null && product?.logo !== null }));
      for (const file of newScreenshots) {
        formData.append("screenshots", file);
      }
      if (newLogo) {
        formData.append("logo", newLogo);
      }
      res = product
        ? await fetch(`/api/products/${product.id}`, { method: "PUT", body: formData })
        : await fetch("/api/products", { method: "POST", body: formData });
    } else {
      res = product
        ? await fetch(`/api/products/${product.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
        : await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
    }

    if (res.ok) {
      toast.success(product ? "Product updated" : "Product created");
      router.push("/products");
    } else {
      toast.error("Error saving product");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Description *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={3}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Logo
        </label>
        {(existingLogo || newLogoPreview) && (
          <div className="flex items-center gap-3 mb-3">
            <div className="relative group">
              <Image
                src={newLogoPreview || existingLogo!}
                alt="Product logo"
                width={0}
                height={0}
                sizes="64px"
                unoptimized
                className="w-16 h-16 object-contain rounded-lg border border-border"
              />
              <button
                type="button"
                onClick={removeLogo}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-error text-white rounded-full text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
              >
                x
              </button>
            </div>
          </div>
        )}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          onChange={handleLogoUpload}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary file:text-white hover:file:bg-primary-hover"
        />
        <p className="text-xs text-text-tertiary mt-1">Product logo used in generated content</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Plan File
        </label>
        {planFileName ? (
          <div className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg">
            <span className="text-sm text-text-primary flex-1">{planFileName}</span>
            <button
              type="button"
              onClick={handleRemoveFile}
              className="text-sm text-error hover:text-error"
            >
              Remove
            </button>
          </div>
        ) : (
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.markdown"
            onChange={handleFileUpload}
            className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary file:text-white hover:file:bg-primary-hover"
          />
        )}
        <p className="text-xs text-text-tertiary mt-1">Upload a markdown file describing the product</p>
      </div>

      {product && planFileName && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReExtract}
            disabled={reExtracting}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-primary/50 text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {reExtracting ? "Re-extracting..." : "Re-extract Profile & Strategy"}
          </button>
          {extractionStatus && (
            <span className={`text-xs font-medium ${
              extractionStatus === "done" ? "text-success" :
              extractionStatus === "failed" ? "text-error" :
              extractionStatus === "extracting" ? "text-warning" :
              "text-text-tertiary"
            }`}>
              {extractionStatus === "done" ? "Extraction complete" :
               extractionStatus === "failed" ? "Extraction failed" :
               extractionStatus === "extracting" ? "Extracting..." :
               extractionStatus === "pending" ? "Pending..." : ""}
            </span>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Text Provider
        </label>
        <select
          value={textProvider}
          onChange={async (e) => {
            const val = e.target.value;
            setTextProvider(val);
            if (val === "antigravity" && antigravityModels.length === 0) {
              try {
                const res = await fetch("/api/settings/antigravity-models");
                if (res.ok) setAntigravityModels(await res.json());
              } catch { /* ignore */ }
            }
            if (val === "claude-code" && claudeCodeModels.length === 0) {
              try {
                const res = await fetch("/api/settings/claude-code-models");
                if (res.ok) setClaudeCodeModels(await res.json());
              } catch { /* ignore */ }
            }
          }}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
        >
          <option value="gemini">Gemini — gemini-2.5-flash</option>
          <option value="gemini-flash-lite">Gemini — gemini-2.5-flash-lite</option>
          <option value="huggingface">HuggingFace — GLM-4.5V</option>
          <option value="antigravity">Antigravity (local CLI)</option>
          <option value="claude-code">Claude Code (local CLI)</option>
        </select>
        {textProvider === "antigravity" && (
          <select
            value={antigravityModel}
            onChange={(e) => setAntigravityModel(e.target.value)}
            className="w-full mt-2 px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">Default model</option>
            {antigravityModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        {textProvider === "claude-code" && (
          <select
            value={claudeCodeModel}
            onChange={(e) => setClaudeCodeModel(e.target.value)}
            className="w-full mt-2 px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">Default model</option>
            {claudeCodeModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        <p className="text-xs text-text-tertiary mt-1">LLM provider for profile/strategy extraction</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Image Provider
        </label>
        <select
          value={imageProvider}
          onChange={(e) => setImageProvider(e.target.value)}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary"
        >
          <option value="">Use default</option>
          <option value="pollinations">Pollinations</option>
          <option value="gemini">Google AI Studio (Gemini)</option>
          <option value="huggingface">HuggingFace</option>
        </select>
        <p className="text-xs text-text-tertiary mt-1">Image generation provider (leave empty to use global default)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          LLM Instructions
        </label>
        <textarea
          value={llmInstructions}
          onChange={(e) => setLlmInstructions(e.target.value)}
          rows={4}
          placeholder="Optional rules, guidance, or constraints for the AI. Examples: 'Always write in British English', 'Focus on technical audience', 'Avoid mentioning competitors', 'Use a humorous tone'..."
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-y"
        />
        <p className="text-xs text-text-tertiary mt-1">Custom instructions injected into all AI operations (extraction, content generation, brainstorm)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Screenshots
        </label>
        {(existingScreenshots.length > 0 || newScreenshotPreviews.length > 0) && (
          <div className="grid grid-cols-4 gap-3 mb-3">
            {existingScreenshots.map((path, i) => (
              <div key={`existing-${i}`} className="relative group">
                <Image src={path} alt="" width={0} height={0} sizes="25vw" unoptimized className="w-full h-24 object-cover rounded-lg border border-border" />
                <button
                  type="button"
                  onClick={() => removeExistingScreenshot(i)}
                  className="absolute top-1 right-1 w-5 h-5 bg-error text-white rounded-full text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            ))}
            {newScreenshotPreviews.map((src, i) => (
              <div key={`new-${i}`} className="relative group">
                <Image src={src} alt="" width={0} height={0} sizes="25vw" unoptimized className="w-full h-24 object-cover rounded-lg border border-primary/30" />
                <button
                  type="button"
                  onClick={() => removeNewScreenshot(i)}
                  className="absolute top-1 right-1 w-5 h-5 bg-error text-white rounded-full text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          ref={screenshotInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleScreenshotUpload}
          className="w-full px-3 py-2 bg-surface border border-border-strong rounded-lg text-text-primary focus:ring-2 focus:ring-primary focus:border-primary file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary file:text-white hover:file:bg-primary-hover"
        />
        <p className="text-xs text-text-tertiary mt-1">Upload product screenshots for image generation</p>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : product ? "Save Changes" : "Create Product"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="px-4 py-2 text-text-secondary font-medium rounded-lg border border-border-strong hover:bg-background"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
