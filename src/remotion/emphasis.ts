// One word per line carrying a different treatment (accent colour, and in video
// a scale-pop) is the signature move of current kinetic-typography ads. The LLM
// marks it by wrapping the word in *asterisks*: "Logged in *seconds*".
//
// We strip the markers before measuring/fitting so the box math is unaffected,
// and remember which words were emphasised so the renderer can style them.

export interface ParsedEmphasis {
  clean: string; // markers removed — what gets measured and wrapped
  emphasized: Set<string>; // normalised words to treat as emphasis
}

// Strip surrounding punctuation for a stable word key. Kept ASCII-simple to
// avoid needing the unicode regex flag (project targets an older ES).
const normalize = (w: string) => w.replace(/[^A-Za-z0-9À-ÿ]/g, "").toLowerCase();

export function parseEmphasis(text: string): ParsedEmphasis {
  const emphasized = new Set<string>();
  const clean = text.replace(/\*([^*]+)\*/g, (_, inner: string) => {
    for (const w of inner.split(/\s+/)) {
      const n = normalize(w);
      if (n) emphasized.add(n);
    }
    return inner;
  });
  return { clean, emphasized };
}

export const isEmphasized = (word: string, set: Set<string>) => set.size > 0 && set.has(normalize(word));
