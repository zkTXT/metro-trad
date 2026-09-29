export const LANGUES = [
  { code: "de", nom: "Allemand", drapeau: "🇩🇪" },
  { code: "es", nom: "Espagnol", drapeau: "🇪🇸" },
  { code: "it", nom: "Italien", drapeau: "🇮🇹" },
  { code: "pt-PT", nom: "Portugais (Portugal)", drapeau: "🇵🇹" },
  { code: "hr", nom: "Croate", drapeau: "🇭🇷" },
] as const;

export type LangCode = (typeof LANGUES)[number]["code"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Moteur 1 : Google Traduction (point d'accès gratuit, sans clé) ----------

const GOOGLE = "https://translate.googleapis.com/translate_a/single";
const GOOGLE_MAX = 4000;

async function googleOnce(text: string, to: string): Promise<string> {
  const res = await fetch(GOOGLE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client: "gtx", sl: "fr", tl: to, dt: "t", q: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const data = (await res.json()) as [Array<[string]>];
  return data[0].map((seg) => seg[0]).join("");
}

async function google(text: string, to: string): Promise<string> {
  // Les textes très longs sont coupés par paragraphe.
  const parts: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur && (cur + "\n" + line).length > GOOGLE_MAX) {
      parts.push(cur);
      cur = line;
    } else {
      cur = cur ? cur + "\n" + line : line;
    }
  }
  if (cur) parts.push(cur);

  const out: string[] = [];
  for (const p of parts) {
    let lastError: unknown;
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      try {
        out.push(await googleOnce(p, to));
        done = true;
      } catch (e) {
        lastError = e;
        await sleep(1200 * (attempt + 1));
      }
    }
    if (!done) throw lastError;
  }
  return out.join("\n");
}

// ---------- Moteur 2 : MyMemory (secours, gratuit, sans clé) ----------

const MYMEMORY = "https://api.mymemory.translated.net/get";
const MYMEMORY_MAX = 450;

function sentenceChunks(line: string): string[] {
  if (line.length <= MYMEMORY_MAX) return [line];
  const sentences = line.match(/[^.!?]+[.!?]*\s*/g) ?? [line];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > MYMEMORY_MAX) {
      out.push(cur);
      cur = "";
    }
    cur += s;
  }
  if (cur) out.push(cur);
  return out;
}

async function myMemoryChunk(text: string, to: string): Promise<string> {
  const url = `${MYMEMORY}?${new URLSearchParams({ q: text, langpair: `fr|${to}` })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = (await res.json()) as {
    responseStatus: number | string;
    responseData?: { translatedText?: string };
  };
  const t = data.responseData?.translatedText;
  if (Number(data.responseStatus) !== 200 || !t) {
    throw new Error(`MyMemory ${data.responseStatus}`);
  }
  return t;
}

async function myMemory(text: string, to: string): Promise<string> {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      lines.push(line);
      continue;
    }
    const parts: string[] = [];
    for (const c of sentenceChunks(line)) parts.push(await myMemoryChunk(c, to));
    lines.push(parts.join(" ").replace(/\s{2,}/g, " ").trim());
  }
  return lines.join("\n");
}

// ---------- API publique ----------

export async function translateText(text: string, to: LangCode): Promise<string> {
  if (!text.trim()) return "";
  try {
    return await google(text, to);
  } catch (googleError) {
    try {
      return await myMemory(text, to);
    } catch (fallbackError) {
      const a = googleError instanceof Error ? googleError.message : "?";
      const b = fallbackError instanceof Error ? fallbackError.message : "?";
      throw new Error(`${a} ; ${b}`);
    }
  }
}
