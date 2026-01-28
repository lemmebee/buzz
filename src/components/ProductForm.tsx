"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Product } from "../../drizzle/schema";

interface ProductFormProps {
  product?: Product;
}

export function ProductForm({ product }: ProductFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [url, setUrl] = useState(product?.url || "");
  const [audience, setAudience] = useState(product?.audience || "");
  const [tone, setTone] = useState(product?.tone || "");
  const [planFile, setPlanFile] = useState(product?.planFile || "");
  const [planFileName, setPlanFileName] = useState(product?.planFileName || "");
  const [textProvider, setTextProvider] = useState(product?.textProvider || "gemini");

  // Screenshots: existing paths from DB + new files to upload
  const [existingScreenshots, setExistingScreenshots] = useState<string[]>(
    product?.screenshots ? JSON.parse(product.screenshots) : []
  );
  const [newScreenshots, setNewScreenshots] = useState<File[]>([]);
  const [newScreenshotPreviews, setNewScreenshotPreviews] = useState<string[]>([]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setPlanFile(text);
    setPlanFileName(file.name);

    // Auto-populate fields from plan file content
    autoPopulateFromPlan(text);
  }

  function autoPopulateFromPlan(content: string) {
    const lines = content.split("\n");

    // Helper to extract list items from a section
    function extractListItems(sectionContent: string): string[] {
      return sectionContent
        .split("\n")
        .filter(line => line.match(/^[\s]*[-*•]\s+/) || line.match(/^\d+\.\s+/))
        .map(line => line.replace(/^[\s]*[-*•]\s+/, "").replace(/^\d+\.\s+/, "").replace(/\*\*/g, "").trim())
        .filter(Boolean);
    }

    // Helper to find section content by various header patterns
    function findSection(...patterns: string[]): string | null {
      for (const pattern of patterns) {
        const regex = new RegExp(`(?:^|\\n)#+\\s*${pattern}\\s*\\n([\\s\\S]*?)(?=\\n#+\\s|$)`, "i");
        const match = content.match(regex);
        if (match) return match[1];
      }
      return null;
    }

    // Extract name from first heading (# Title or ## Title)
    const titleMatch = content.match(/^#+\s+(.+)$/m);
    if (titleMatch) {
      setName(titleMatch[1].trim());
    }

    // Find description - first paragraph after title
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

    // Extract audience
    const audienceSection = findSection("Target\\s+Audience", "Audience", "Who\\s+is\\s+this\\s+for");
    if (audienceSection) {
      const audienceItems = extractListItems(audienceSection);
      if (audienceItems.length > 0) {
        setAudience(audienceItems.join(", "));
      } else {
        // Try first non-empty line
        const firstLine = audienceSection.split("\n").find(l => l.trim() && !l.match(/^#+/));
        if (firstLine) setAudience(firstLine.trim());
      }
    }

    // Extract tone
    const toneSection = findSection("Tone", "Voice", "Brand\\s+Voice", "Tone\\s+&\\s+Voice");
    if (toneSection) {
      const toneText = toneSection.toLowerCase();
      if (toneText.includes("casual")) setTone("casual");
      else if (toneText.includes("professional")) setTone("professional");
      else if (toneText.includes("playful")) setTone("playful");
      else if (toneText.includes("warm")) setTone("warm");
      else if (toneText.includes("edgy")) setTone("edgy");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const data = {
      name,
      description,
      url: url || null,
      audience: audience || null,
      tone: tone || null,
      planFile: planFile || null,
      planFileName: planFileName || null,
      textProvider: textProvider || null,
      // Tell API to replace screenshots with existing (kept) + new uploads
      replaceScreenshots: true,
    };

    const useFormData = newScreenshots.length > 0 || existingScreenshots.length !== (product?.screenshots ? JSON.parse(product.screenshots).length : 0);

    let res: Response;

    if (useFormData) {
      const formData = new FormData();
      // Pass existing kept paths so API knows what to preserve
      formData.append("data", JSON.stringify({ ...data, existingScreenshots }));
      for (const file of newScreenshots) {
        formData.append("screenshots", file);
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
      router.push("/products");
    } else {
      alert("Error saving product");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Plan File
        </label>
        {planFileName ? (
          <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <span className="text-sm text-gray-900 flex-1">{planFileName}</span>
            <button
              type="button"
              onClick={handleRemoveFile}
              className="text-sm text-red-600 hover:text-red-800"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        )}
        <p className="text-xs text-gray-500 mt-1">Upload a markdown file describing the product</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Text Provider
        </label>
        <select
          value={textProvider}
          onChange={(e) => setTextProvider(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="gemini">Gemini</option>
          <option value="huggingface">Hugging Face</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">LLM provider for profile/strategy extraction</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Screenshots
        </label>
        {(existingScreenshots.length > 0 || newScreenshotPreviews.length > 0) && (
          <div className="grid grid-cols-4 gap-3 mb-3">
            {existingScreenshots.map((path, i) => (
              <div key={`existing-${i}`} className="relative group">
                <img src={path} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                <button
                  type="button"
                  onClick={() => removeExistingScreenshot(i)}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            ))}
            {newScreenshotPreviews.map((src, i) => (
              <div key={`new-${i}`} className="relative group">
                <img src={src} alt="" className="w-full h-24 object-cover rounded-lg border border-blue-200" />
                <button
                  type="button"
                  onClick={() => removeNewScreenshot(i)}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <p className="text-xs text-gray-500 mt-1">Upload app screenshots for image generation</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target Audience
        </label>
        <input
          type="text"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="e.g., Cannabis users 18-35"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tone
        </label>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select tone...</option>
          <option value="casual">Casual</option>
          <option value="professional">Professional</option>
          <option value="playful">Playful</option>
          <option value="warm">Warm</option>
          <option value="edgy">Edgy</option>
        </select>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : product ? "Save Changes" : "Create Product"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="px-4 py-2 text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
