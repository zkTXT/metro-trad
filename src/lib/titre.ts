// Mise en forme mécanique du titre (sans IA) :
//   - les tirets qui séparent les attributs deviennent des virgules ;
//   - les dimensions sont ajoutées (ou remises au format) en fin de titre :
//     « … – 44 x 44 x 110 cm » (largeur x profondeur x hauteur).
// On ne réordonne jamais le titre et on n'invente rien : les dimensions viennent
// du titre lui-même, des colonnes du modèle Metro ou de la description.

const NB = String.raw`\d+(?:[.,]\d+)?`;
const ETIQ = String.raw`(?:[LlPpHh]\.?\s*)?`;
const UNE = `(${ETIQ}${NB})`;
// « L 56 x P 62 x H 81 cm », « 44 x 44 x 110 cm », « 44x44x110cm »…
const DIM_RE = new RegExp(
  `${UNE}\\s*(?:cm)?\\s*[x×X]\\s*${UNE}\\s*(?:cm)?\\s*[x×X]\\s*${UNE}\\s*cm\\b`,
);

const RANG: Record<string, number> = { L: 1, l: 2, P: 2, p: 2, H: 3, h: 3 };

function formaterDimensions(m: RegExpExecArray): string {
  const items = [m[1], m[2], m[3]].map((g) => ({
    etiquette: g.match(/^[LlPpHh]/)?.[0],
    nombre: g.match(new RegExp(NB))![0],
  }));
  const rangs = items.map((i) => (i.etiquette ? RANG[i.etiquette] : 0));
  const complet = rangs.every(Boolean) && new Set(rangs).size === 3;
  // Étiquetées : on remet dans l'ordre largeur, profondeur, hauteur.
  const ordre = complet
    ? items
        .map((i, k) => ({ i, r: rangs[k] }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.i)
    : items;
  return `${ordre.map((i) => i.nombre).join(" x ")} cm`;
}

/** Première dimension « a x b x c cm » trouvée dans un texte, au format « 56 x 62 x 81 cm ». */
export function extraireDimensions(texte: string): string | null {
  const m = DIM_RE.exec(texte);
  return m ? formaterDimensions(m) : null;
}

const MAJ = "A-ZÀ-ÖØ-Þ";
const EST_SIGLE = new RegExp(`^[${MAJ}0-9][${MAJ}0-9'’-]+$`);

// Un attribut est mis en minuscules, sauf les sigles et noms de modèle (YORK, BORO).
const minuscules = (p: string) =>
  p
    .split(" ")
    .map((w) => (EST_SIGLE.test(w) ? w : w.toLowerCase()))
    .join(" ");

const estModele = (p: string) =>
  p
    .split(" ")
    .every((w) => w === w.toUpperCase() && new RegExp(`[${MAJ}]`).test(w));

export function soignerTitre(
  titre: string,
  dimensions?: string | null,
): string {
  let t = titre.replace(/\s+/g, " ").trim();
  if (!t) return titre;

  // Dimensions déjà présentes dans le titre : on les retire pour les remettre au bon format.
  let dimsTitre: string | null = null;
  const m = DIM_RE.exec(t);
  if (m) {
    dimsTitre = formaterDimensions(m);
    t = (
      t.slice(0, m.index).replace(/[\s\-–—,:|]+$/, "") +
      " " +
      t.slice(m.index + m[0].length).replace(/^[\s\-–—,:|]+/, "")
    ).trim();
  }

  t = t.replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, "");
  const [tete, ...reste] = t.split(/\s+[-–—|]\s+/);
  let out = tete.trim();
  for (const brut of reste) {
    const a = brut.trim();
    if (!a) continue;
    out += estModele(a) ? ` ${a}` : `, ${minuscules(a)}`;
  }

  const d = dimsTitre ?? dimensions;
  if (d) out += ` – ${d}`;

  out = out.replace(/'/g, "’");
  return out.charAt(0).toUpperCase() + out.slice(1);
}
