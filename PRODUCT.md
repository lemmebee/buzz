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

One pipeline: product context → one text call → one image call. Two engines
render that image, switchable globally or per product.

### Buzz (default)
- **How it works:** the text provider writes a caption, hashtags and an image
  prompt; the image provider renders it.
- **Providers:** Pollinations · Google AI Studio (Gemini) · HuggingFace
- **Cost:** free
- **Limitation:** the image is whatever the model invents from a description.
  It cannot show your real product UI, because nothing composites your
  screenshots.

### Higgsfield
- **How it works:** the same authored prompt plus a real product screenshot as
  a reference image, generated through the Higgsfield MCP.
- **Cost:** ~2 credits an image, ~2-4 a video
- **Best for:** anything that must show the actual app. This is the only path
  that does.
- **Requires:** Claude Code CLI with the Higgsfield MCP authenticated
- **Limitation:** generative models mangle Arabic and RTL text. Keep Arabic in
  the caption, not in the image.

### Video

Video exists on one path only: Higgsfield image-to-video. An image is generated
first, then animated. Duration is snapped to the values the chosen model
accepts.

There is no rendering engine. Remotion, ffmpeg, text-to-speech, burned captions
and video styles were removed — see `docs/SIMPLIFICATION.md`.

### Setup
1. Install the Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
2. Authenticate the MCP once: `claude --mcp-config higgsfield-mcp.json --strict-mcp-config`, then `/mcp`
3. Settings → Content Engine → Higgsfield
4. Settings → Refresh models, then pick one

### Cost management
- The model picker is sorted cheapest first and shows credits per generation
- Video is user-triggered only; the scheduled worker never generates it
- `npx tsx scripts/test-higgsfield.ts --cost` preflights without spending
