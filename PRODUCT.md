# Product

## Register

product

## Users

Indie marketers and solopreneurs managing their own products and social media channels. They open Buzz to generate, review, schedule, and publish Instagram content — often juggling multiple products. They're competent, time-constrained, and want the tool to stay out of their way.

## Product Purpose

Buzz automates the repetitive parts of social media marketing: AI extracts product profiles from briefs, generates varied content (posts, reels, stories, ads), and manages the full lifecycle from draft to published. Smart rotation prevents repetitive messaging. The job is done when content flows from idea to Instagram with minimal manual work.

## Brand Personality

Professional, efficient, confident. The interface gets out of the way and lets the work speak. No hand-holding, no decoration for its own sake. Think Linear: sharp typography, minimal chrome, purposeful motion, dark mode native. The feeling should be "this tool respects my time."

## Anti-references

- Generic AI/SaaS aesthetics: purple gradients, glow effects, neon accents, "AI-powered" hero sections
- Overly playful or toy-like interfaces that undermine professional credibility
- Heavy, corporate enterprise tool feel

## Design Principles

1. **Content over chrome.** The generated content (images, captions, product data) is the star. The UI recedes.
2. **Speed of comprehension.** Dense information, clear hierarchy, scannable at a glance. No decorative padding.
3. **AI as invisible assistant.** The AI works behind the scenes. The interface shows results, not the machinery.
4. **Earn every element.** If it doesn't help the user move faster or decide better, it doesn't belong.

## Accessibility & Inclusion

- WCAG AA compliance
- Good color contrast (4.5:1 minimum for body text)
- Keyboard navigation support
- Screen reader friendly labels and ARIA attributes
- Respect prefers-reduced-motion

## Content Engines

Buzz supports two content generation engines, switchable globally or per-product:

### Buzz Engine (Default)
- **What it does:** Remotion/spec compositor with full typographic control
- **Cost:** Free (uses local AI providers)
- **Best for:** Deterministic layouts, precise brand control, Arabic/RTL text
- **How it works:** Generates specs → Remotion renders video with branded overlays, kinetic captions, cross-fades

### Higgsfield Engine
- **What it does:** Generative AI media creation (photoreal images, videos)
- **Cost:** ~2 credits/image, ~4-60 credits/video (varies by model)
- **Best for:** Photoreal product shots, creative video content
- **Requirements:** Claude Code CLI + Higgsfield MCP authenticated
- **Known limitation:** Generative models mangle Arabic/RTL text. For Arabic copy, prefer the Buzz engine.

### Setup
1. Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
2. Authenticate Higgsfield MCP: `claude --mcp-config higgsfield-mcp.json --strict-mcp-config`, then `/mcp` to connect
3. Set `CONTENT_ENGINE=higgsfield` in Settings (or per-product override)
4. Choose models in Settings → Higgsfield Content Engine

### Cost Management
- Models are sorted by cost in the picker (cheapest first)
- Video generation is user-triggered only (not scheduled) to prevent unexpected credit spend
- Use `--cost` preflight before generation to see exact cost
