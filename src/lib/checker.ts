import regles from "./regles.json";

export type Mode = "supprimer" | "signaler";
export type Verdict = "valide" | "a_verifier" | "refuse";

export interface Issue {
  champ: "titre" | "description";
  extrait: string;
  raison: string;
  categorie: "variante" | "option" | "mot" | "boutique" | "longueur";
  supprime: boolean;
}

export interface FieldResult {
  original: string;
  nettoye: string;
  issues: Issue[];
}

export interface CheckResult {
  titre: FieldResult;
  description: FieldResult;
  verdict: Verdict;
  messageMetro: string | null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compile = (motif: string) => new RegExp(motif, "i");

const tidy = (s: string) =>
  s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*([.!?])/g, "$2")
    .replace(/([.!?])(\s*[.!?])+/g, "$1")
    .replace(/^[\s,;:.-]+/, "")
    .trim();

// Découpe en phrases en gardant la ponctuation et les retours à la ligne.
function splitSentences(text: string): string[] {
  return text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [];
}

function checkField(
  champ: "titre" | "description",
  text: string,
  mode: Mode,
): FieldResult {
  const issues: Issue[] = [];
  const maxLen =
    champ === "titre"
      ? regles.titreMaxCaracteres
      : regles.descriptionMaxCaracteres;

  // 1. Phrases entières interdites (variantes / options) : on retire la phrase.
  const phrases = compile(
    regles.phrasesInterdites.map((r) => `(${r.motif})`).join("|"),
  );
  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    if (!sentence.trim()) {
      kept.push(sentence);
      continue;
    }
    const rule = regles.phrasesInterdites.find((r) =>
      compile(r.motif).test(sentence),
    );
    if (rule && phrases.test(sentence)) {
      issues.push({
        champ,
        extrait: sentence.trim(),
        raison: rule.raison,
        categorie: rule.categorie as "variante" | "option",
        supprime: mode === "supprimer",
      });
      if (mode === "signaler") kept.push(sentence);
    } else {
      kept.push(sentence);
    }
  }
  let out = kept.join("");

  // 2. Mots / expressions interdits : on retire juste le mot.
  for (const rule of regles.motsInterdits) {
    const re = new RegExp(rule.motif, "gi");
    const matches = out.match(re);
    if (matches) {
      for (const m of new Set(matches)) {
        issues.push({
          champ,
          extrait: m,
          raison: rule.raison,
          categorie: "mot",
          supprime: mode === "supprimer",
        });
      }
      if (mode === "supprimer") out = out.replace(re, "");
    }
  }

  // 3. Nom de la boutique.
  for (const nom of regles.boutique) {
    if (!nom.trim()) continue;
    const re = new RegExp(escapeRegex(nom), "gi");
    if (re.test(out)) {
      issues.push({
        champ,
        extrait: nom,
        raison: "Nom de la boutique mentionné",
        categorie: "boutique",
        supprime: mode === "supprimer",
      });
      if (mode === "supprimer") out = out.replace(re, "");
    }
  }

  out = mode === "supprimer" ? tidy(out) : out;

  // 4. Longueur (jamais corrigée automatiquement).
  if (out.length > maxLen) {
    issues.push({
      champ,
      extrait: `${out.length} caractères`,
      raison: `${champ === "titre" ? "Titre" : "Description"} trop long (max ${maxLen})`,
      categorie: "longueur",
      supprime: false,
    });
  }

  return { original: text, nettoye: out, issues };
}

export function checkProduct(
  titre: string,
  description: string,
  mode: Mode = "supprimer",
): CheckResult {
  const t = checkField("titre", titre, mode);
  const d = checkField("description", description, mode);
  const all = [...t.issues, ...d.issues];

  const nonCorrige = all.some((i) => !i.supprime);
  const verdict: Verdict =
    all.length === 0 ? "valide" : nonCorrige ? "refuse" : "a_verifier";

  const metro = all.some(
    (i) => i.categorie === "variante" || i.categorie === "option",
  );

  return {
    titre: t,
    description: d,
    verdict,
    messageMetro: metro ? regles.messageMetro : null,
  };
}
