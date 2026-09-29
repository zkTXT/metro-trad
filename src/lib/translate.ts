export const LANGUES = [
  { code: "de", nom: "Allemand", drapeau: "🇩🇪" },
  { code: "es", nom: "Espagnol", drapeau: "🇪🇸" },
  { code: "it", nom: "Italien", drapeau: "🇮🇹" },
  { code: "pt-PT", nom: "Portugais (Portugal)", drapeau: "🇵🇹" },
  { code: "hr", nom: "Croate", drapeau: "🇭🇷" },
] as const;

export type LangCode = (typeof LANGUES)[number]["code"];

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const MAX_CHUNK = 1500;

// Coupe un long paragraphe en morceaux < MAX_CHUNK, à la fin des phrases.
function chunk(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHUNK) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > MAX_CHUNK) {
      out.push(cur);
      cur = "";
    }
    cur += s;
  }
  if (cur) out.push(cur);
  return out;
}

async function translateChunk(text: string, to: string): Promise<string> {
  const body = new URLSearchParams({
    client: "gtx",
    sl: "fr",
    tl: to,
    dt: "t",
    q: text,
  });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as [Array<[string]>];
      return data[0].map((seg) => seg[0]).join("");
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Traduction échouée");
}

// Traduit un texte en conservant les retours à la ligne.
export async function translateText(text: string, to: LangCode): Promise<string> {
  if (!text.trim()) return "";
  const lines = text.split("\n");
  const out = await Promise.all(
    lines.map(async (line) => {
      if (!line.trim()) return line;
      const parts = await Promise.all(chunk(line).map((c) => translateChunk(c, to)));
      return parts.join(" ").replace(/\s{2,}/g, " ").trim();
    }),
  );
  return out.join("\n");
}
