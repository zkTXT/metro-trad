export const LANGUES = [
  { code: "de", nom: "Allemand", drapeau: "🇩🇪" },
  { code: "hr", nom: "Croate", drapeau: "🇭🇷" },
  { code: "es", nom: "Espagnol", drapeau: "🇪🇸" },
  { code: "it", nom: "Italien", drapeau: "🇮🇹" },
  { code: "nl", nom: "Néerlandais", drapeau: "🇳🇱" },
  { code: "pt-PT", nom: "Portugais (Portugal)", drapeau: "🇵🇹" },
] as const;

export type LangCode = (typeof LANGUES)[number]["code"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Moteur 1 : Google Traduction (point d'accès gratuit, sans clé) ----------

const GOOGLE = "https://translate.googleapis.com/translate_a/single";
const GOOGLE_MAX = 4000;

// Disjoncteur : après un 429, on n'insiste pas et on passe au moteur de secours.
let googlePauseJusqua = 0;
const PAUSE_GOOGLE_MS = 10 * 60 * 1000;

async function googleOnce(text: string, to: string): Promise<string> {
  const res = await fetch(GOOGLE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client: "gtx",
      sl: "fr",
      tl: to,
      dt: "t",
      q: text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 429) {
    googlePauseJusqua = Date.now() + PAUSE_GOOGLE_MS;
    throw new Error("Google HTTP 429");
  }
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const data = (await res.json()) as [Array<[string]>];
  return data[0].map((seg) => seg[0]).join("");
}

async function google(text: string, to: string): Promise<string> {
  if (Date.now() < googlePauseJusqua) throw new Error("Google en pause (429)");
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
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      try {
        out.push(await googleOnce(p, to));
        done = true;
      } catch (e) {
        lastError = e;
        if (Date.now() < googlePauseJusqua) break; // 429 : inutile de réessayer
        await sleep(800);
      }
    }
    if (!done) throw lastError;
  }
  return out.join("\n");
}

// ---------- Moteur 2 : MyMemory (secours, gratuit) ----------

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

// Emails d'identification (MYMEMORY_EMAILS dans .env.local). Chaque email a son quota
// quotidien ; on passe au suivant dès que l'un est épuisé.
const emails = () =>
  (process.env.MYMEMORY_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

const jour = () => new Date().toISOString().slice(0, 10);
const epuises = new Map<string, string>(); // email -> jour où le quota a été atteint
let curseur = 0;

const quotaAtteint = (status: number | string, texte: string) =>
  Number(status) === 429 || /MYMEMORY WARNING|USED ALL AVAILABLE/i.test(texte);

async function myMemoryChunk(text: string, to: string): Promise<string> {
  const liste = emails();
  // Sans email configuré : mode anonyme (quota réduit).
  const candidats: (string | null)[] = liste.length ? liste : [null];

  let derniere = "MyMemory : quota épuisé pour tous les emails";
  for (let i = 0; i < candidats.length; i++) {
    const email = candidats[(curseur + i) % candidats.length];
    if (email && epuises.get(email) === jour()) continue;

    const params = new URLSearchParams({ q: text, langpair: `fr|${to}` });
    if (email) params.set("de", email);
    const res = await fetch(`${MYMEMORY}?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 429) {
      if (email) epuises.set(email, jour());
      derniere = "MyMemory HTTP 429";
      continue;
    }
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);

    const data = (await res.json()) as {
      responseStatus: number | string;
      responseData?: { translatedText?: string };
    };
    const t = data.responseData?.translatedText ?? "";
    if (quotaAtteint(data.responseStatus, t)) {
      if (email) epuises.set(email, jour());
      derniere = "MyMemory : quota quotidien atteint";
      continue;
    }
    if (Number(data.responseStatus) !== 200 || !t) {
      throw new Error(`MyMemory ${data.responseStatus}`);
    }
    curseur = (curseur + i) % candidats.length; // on reste sur l'email qui marche
    return t;
  }
  throw new Error(derniere);
}

async function myMemory(text: string, to: string): Promise<string> {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      lines.push(line);
      continue;
    }
    const parts: string[] = [];
    for (const c of sentenceChunks(line))
      parts.push(await myMemoryChunk(c, to));
    lines.push(
      parts
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    );
  }
  return lines.join("\n");
}

// ---------- API publique ----------

export async function translateText(
  text: string,
  to: LangCode,
): Promise<string> {
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
