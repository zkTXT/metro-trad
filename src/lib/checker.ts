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
    .replace(/\s+([,.])/g, "$1")
    .replace(/([,;:])\s*([.!?])/g, "$2")
    .replace(/([.!?])(\s*[.!?])+/g, "$1")
    .replace(/^[\s,;:.-]+/, "")
    .trim();

// Mots qui ne peuvent pas terminer une phrase : signe qu'un mot interdit a été retiré.
const MOTS_PENDANTS = new Set([
  "sur",
  "chez",
  "par",
  "de",
  "du",
  "des",
  "d",
  "à",
  "au",
  "aux",
  "en",
  "pour",
  "avec",
  "et",
  "ou",
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "notre",
  "nos",
  "votre",
  "vos",
  "sans",
  "dans",
  "vers",
]);

const motsDe = (s: string) =>
  s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];

// Mots qui ne peuvent pas OUVRIR une phrase (contrairement à « le », « un »…).
const MOTS_DEBUT_ORPHELIN = new Set([
  "sur",
  "chez",
  "par",
  "de",
  "du",
  "des",
  "d",
  "à",
  "au",
  "aux",
  "en",
  "pour",
  "avec",
  "et",
  "ou",
  "sans",
  "dans",
  "vers",
]);

function estOrphelin(s: string): boolean {
  const mots = motsDe(s);
  return (
    mots.length < 3 ||
    MOTS_PENDANTS.has(mots[mots.length - 1].toLowerCase()) ||
    MOTS_DEBUT_ORPHELIN.has(mots[0]?.toLowerCase() ?? "")
  );
}

function couperFinPendante(s: string): string {
  let t = s.replace(/[\s,;:.-]+$/, "");
  for (;;) {
    const m = t.match(/\s+([\p{L}]+)$/u);
    if (m && MOTS_PENDANTS.has(m[1].toLowerCase()))
      t = t.slice(0, -m[0].length);
    else return t;
  }
}

// Découpe en phrases en gardant la ponctuation et les retours à la ligne.
function splitSentences(text: string): string[] {
  // On ne coupe qu'après un point suivi d'un espace ou de la fin : « bistromania.fr »
  // et « 1.5 m » restent d'un seul tenant.
  return text.match(/[^\n]*?[.!?]+(?=\s|$)\s*|[^\n]+|\n+/g) ?? [];
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
  // 2 et 3. Mots interdits et nom de la boutique, phrase par phrase : on retire le
  // mot ; si ce qui reste est un fragment orphelin (« sur. »), la description perd
  // la phrase entière, et un titre perd seulement ses mots pendants.
  const sortie: string[] = [];
  for (const sentence of kept) {
    if (!sentence.trim()) {
      sortie.push(sentence);
      continue;
    }
    let s = sentence;
    const retraits: {
      extrait: string;
      raison: string;
      categorie: Issue["categorie"];
    }[] = [];
    for (const rule of regles.motsInterdits) {
      const re = new RegExp(rule.motif, "gi");
      const found = s.match(re);
      if (found) {
        for (const m of new Set(found)) {
          retraits.push({ extrait: m, raison: rule.raison, categorie: "mot" });
        }
        s = s.replace(re, "");
      }
    }
    for (const nom of regles.boutique) {
      if (!nom.trim()) continue;
      // La préposition qui précède le nom (« par Bistromania ») part avec lui.
      const re = new RegExp(
        `(?:(?<![\\p{L}])(?:par|chez|de|du|sur|à|pour|avec)\\s+)?${escapeRegex(nom)}`,
        "giu",
      );
      if (re.test(s)) {
        retraits.push({
          extrait: nom,
          raison: "Nom de la boutique mentionné",
          categorie: "boutique",
        });
        s = s.replace(re, "");
      }
    }
    if (retraits.length === 0) {
      sortie.push(sentence);
      continue;
    }
    const supprimer = mode === "supprimer";
    // Une phrase dont le sujet est « notre boutique » est supprimée en entier.
    const parleDeLaBoutique = retraits.some(
      (r) => r.raison === "Ne pas parler de la boutique",
    );
    const phraseEntiere =
      supprimer &&
      champ === "description" &&
      (parleDeLaBoutique || estOrphelin(s));
    for (const r of retraits) {
      issues.push({
        champ,
        extrait: phraseEntiere ? sentence.trim() : r.extrait,
        raison: r.raison,
        categorie: r.categorie,
        supprime: supprimer,
      });
    }
    if (!supprimer) sortie.push(sentence);
    else if (!phraseEntiere)
      sortie.push(champ === "titre" ? couperFinPendante(s) : s);
  }
  let out = sortie.join("");

  // Aucune suppression : le texte d'origine est rendu tel quel, au caractère près.
  out = issues.some((i) => i.supprime) ? tidy(out) : text;

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
