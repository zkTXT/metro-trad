// Lecture / écriture des fichiers Excel, entièrement dans le navigateur
// (le fichier n'est jamais envoyé au serveur).
import type { Row, Workbook, Worksheet } from "exceljs";
import { CONSIGNES_SECURITE } from "./consignes";
import { LANGUES, type LangCode } from "./translate";

export interface Colonne {
  index: number; // 1 = colonne A
  nom: string;
}

export interface LigneSource {
  numero: number; // numéro de ligne dans la feuille
  titre: string;
  description: string;
}

// ExcelJS lit <strike val="0"/> comme « barré » (il ne regarde pas la valeur) : un
// fichier Metro se retrouvait entièrement barré, gras et italique. On normalise
// donc les polices avant la lecture : « val="0" » disparaît, « val="1" » devient
// une balise simple.
export function corrigerPolices(styles: string): string {
  const balises = "b|i|strike|outline|shadow|condense|extend";
  return styles
    .replace(new RegExp(`<(?:${balises})\\s+val="(?:0|false)"\\s*/>`, "g"), "")
    .replace(
      new RegExp(`<(${balises})\\s+val="(?:1|true)"\\s*/>`, "g"),
      "<$1/>",
    );
}

export async function lireClasseur(file: File): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const fichierStyles = zip.file("xl/styles.xml");
  if (fichierStyles) {
    const xml = await fichierStyles.async("string");
    const corrige = corrigerPolices(xml);
    if (corrige !== xml) zip.file("xl/styles.xml", corrige);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await zip.generateAsync({ type: "arraybuffer" }));
  return wb;
}

export const nomsFeuilles = (wb: Workbook) => wb.worksheets.map((w) => w.name);

const texte = (v: { text?: string } | undefined) =>
  (v?.text ?? "").toString().trim();

export function lireEntetes(ws: Worksheet, ligneEntete: number): Colonne[] {
  const cols: Colonne[] = [];
  const row = ws.getRow(ligneEntete);
  const max = Math.max(ws.actualColumnCount, ws.columnCount, row.cellCount);
  for (let c = 1; c <= max; c++) {
    const nom = texte(row.getCell(c));
    if (nom) cols.push({ index: c, nom });
  }
  return cols;
}

// Devine les colonnes titre / description d'après le nom des en-têtes.
export function devinerColonnes(cols: Colonne[]) {
  const trouver = (re: RegExp) => cols.find((c) => re.test(c.nom))?.index ?? 0;
  return {
    titre: trouver(
      /titre|title|d[ée]signation|libell[ée]|nom (du )?produit|product name|^nom$/i,
    ),
    description: trouver(/description|desc\b|d[ée]tail/i),
  };
}

export function lireLignes(
  ws: Worksheet,
  ligneEntete: number,
  colTitre: number,
  colDescription: number,
): LigneSource[] {
  const out: LigneSource[] = [];
  for (let r = ligneEntete + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const titre = colTitre ? texte(row.getCell(colTitre)) : "";
    const description = colDescription
      ? texte(row.getCell(colDescription))
      : "";
    if (titre || description) out.push({ numero: r, titre, description });
  }
  return out;
}

export interface ResultatLigne {
  statut: string; // ex. « Validé », « Corrigé », « À corriger »
  problemes: string;
  titreNettoye: string;
  descriptionNettoyee: string;
  traductions?: Record<
    string,
    { titre: string; description: string } | { error: string }
  >;
  /** Modèle Metro : pour chaque langue, quelles cases écrire (les autres restent intactes). */
  ecrire?: Record<string, { titre: boolean; description: boolean }>;
}

// Ajoute des colonnes au classeur d'origine (mise en forme conservée) et renvoie le fichier.
export async function exporterClasseur(
  wb: Workbook,
  ws: Worksheet,
  ligneEntete: number,
  resultats: Map<number, ResultatLigne>,
  colonnesOrigine: number,
): Promise<Blob> {
  const debut = colonnesOrigine + 1;
  const colonnes: {
    titre: string;
    valeur: (r: ResultatLigne) => string;
    large?: boolean;
  }[] = [
    { titre: "Statut Metro", valeur: (r) => r.statut },
    { titre: "Problèmes détectés", valeur: (r) => r.problemes, large: true },
    { titre: "Titre nettoyé (FR)", valeur: (r) => r.titreNettoye, large: true },
    {
      titre: "Description nettoyée (FR)",
      valeur: (r) => r.descriptionNettoyee,
      large: true,
    },
  ];
  for (const l of LANGUES) {
    const code = l.code as LangCode;
    const badge = code === "pt-PT" ? "PT" : code.toUpperCase();
    const val = (champ: "titre" | "description") => (r: ResultatLigne) => {
      const t = r.traductions?.[code];
      return t && !("error" in t) ? t[champ] : "";
    };
    colonnes.push({
      titre: `Titre (${badge})`,
      valeur: val("titre"),
      large: true,
    });
    colonnes.push({
      titre: `Description (${badge})`,
      valeur: val("description"),
      large: true,
    });
  }

  colonnes.forEach((col, i) => {
    const c = debut + i;
    const cell = ws.getRow(ligneEntete).getCell(c);
    cell.value = col.titre;
    cell.font = { bold: true, color: { argb: "FF003A80" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFD200" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
    ws.getColumn(c).width = col.large ? 45 : 18;
    for (const [numero, res] of resultats) {
      const dc = ws.getRow(numero).getCell(c);
      dc.value = col.valeur(res);
      dc.alignment = { vertical: "top", wrapText: true };
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---------------------------------------------------------------------------
// Modèle d'import Metro : une colonne « Product name XX » et « Description XX »
// par langue. On remplit ces cases en place (aucune colonne n'est ajoutée).
// ---------------------------------------------------------------------------

const SUFFIXES: Record<string, LangCode | "fr"> = {
  FR: "fr",
  DE: "de",
  HR: "hr",
  ES: "es",
  IT: "it",
  NL: "nl",
  PT: "pt-PT",
};

export interface ModeleMetro {
  ligneEntete: number;
  fr: { titre: number; description: number };
  langues: Partial<Record<LangCode, { titre: number; description: number }>>;
  colRef: number; // MPN / GTIN / MID, pour l'affichage
  securite: Partial<Record<"fr" | LangCode, number>>; // « Product safety instructions XX »
  // Colonnes Width / Length / Height (+ unités), pour compléter le titre.
  dims: Partial<Record<DimCol, number>>;
}

type DimCol =
  "width" | "length" | "height" | "widthUnit" | "lengthUnit" | "heightUnit";

export function detecterModeleMetro(ws: Worksheet): ModeleMetro | null {
  const largeur = Math.max(ws.actualColumnCount, ws.columnCount);
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const titres: Record<string, number> = {};
    const descriptions: Record<string, number> = {};
    let ref = 0;
    const securite: ModeleMetro["securite"] = {};
    const dims: ModeleMetro["dims"] = {};
    for (let c = 1; c <= largeur; c++) {
      const t = texte(row.getCell(c));
      const dim = t.match(/^(Width|Length|Height)( unit)?$/i);
      if (dim) {
        const cle = (dim[1].toLowerCase() + (dim[2] ? "Unit" : "")) as DimCol;
        if (!dims[cle]) dims[cle] = c;
      }
      const sec = t.match(/^Product safety instructions ([A-Z]{2})$/i);
      if (sec) {
        const code = SUFFIXES[sec[1].toUpperCase()];
        if (code && !securite[code]) securite[code] = c;
      }
      const m = t.match(/^(Product name|Description) ([A-Z]{2})$/i);
      if (m) {
        const cible =
          m[1].toLowerCase() === "description" ? descriptions : titres;
        const k = m[2].toUpperCase();
        if (!cible[k]) cible[k] = c;
      }
      if (!ref && /^(MPN|GTIN|MID)$/i.test(t)) ref = c;
    }
    if (titres.FR && descriptions.FR) {
      const langues: ModeleMetro["langues"] = {};
      for (const [suffixe, code] of Object.entries(SUFFIXES)) {
        if (code === "fr") continue;
        if (titres[suffixe] && descriptions[suffixe]) {
          langues[code as LangCode] = {
            titre: titres[suffixe],
            description: descriptions[suffixe],
          };
        }
      }
      return {
        ligneEntete: r,
        fr: { titre: titres.FR, description: descriptions.FR },
        langues,
        colRef: ref,
        securite,
        dims,
      };
    }
  }
  return null;
}

export interface LigneMetro extends LigneSource {
  ref: string;
  dimensions: string | null; // « 44 x 44 x 110 cm » d'après les colonnes Width/Length/Height
  existant: Partial<Record<LangCode, { titre: string; description: string }>>;
}

// Largeur x profondeur x hauteur, uniquement si les trois valeurs sont là et en cm.
function dimensionsMetro(row: Row, m: ModeleMetro): string | null {
  const { width, length, height } = m.dims;
  if (!width || !length || !height) return null;
  const val = (c: number) => texte(row.getCell(c)).replace(/\s/g, "");
  const [w, l, h] = [val(width), val(length), val(height)];
  if (![w, l, h].every((v) => /^\d+(?:[.,]\d+)?$/.test(v))) return null;
  const unites = [m.dims.widthUnit, m.dims.lengthUnit, m.dims.heightUnit];
  if (unites.some((c) => c && texte(row.getCell(c)).toLowerCase() !== "cm"))
    return null;
  return `${w} x ${l} x ${h} cm`;
}

export function lireLignesMetro(ws: Worksheet, m: ModeleMetro): LigneMetro[] {
  const out: LigneMetro[] = [];
  for (let r = m.ligneEntete + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const titre = texte(row.getCell(m.fr.titre));
    const description = texte(row.getCell(m.fr.description));
    if (!titre && !description) continue;
    const existant: LigneMetro["existant"] = {};
    for (const [code, cols] of Object.entries(m.langues)) {
      existant[code as LangCode] = {
        titre: texte(row.getCell(cols.titre)),
        description: texte(row.getCell(cols.description)),
      };
    }
    out.push({
      numero: r,
      titre,
      description,
      ref: m.colRef ? texte(row.getCell(m.colRef)) : "",
      dimensions: dimensionsMetro(row, m),
      existant,
    });
  }
  return out;
}

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Remplit le modèle Metro : français nettoyé + traductions, dans les bonnes cases.
export async function exporterMetro(
  wb: Workbook,
  ws: Worksheet,
  m: ModeleMetro,
  resultats: Map<number, ResultatLigne>,
  opts: { consignes?: { lignes: number[] } } = {},
): Promise<Blob> {
  // Consignes de sécurité standard : ajoutées dans les cases vides, jamais par-dessus
  // un texte déjà présent.
  for (const numero of opts.consignes?.lignes ?? []) {
    const row = ws.getRow(numero);
    for (const [code, col] of Object.entries(m.securite)) {
      const cell = row.getCell(col as number);
      if (!texte(cell))
        cell.value = CONSIGNES_SECURITE[code as "fr" | LangCode];
    }
  }
  for (const [numero, res] of resultats) {
    const row = ws.getRow(numero);
    row.getCell(m.fr.titre).value = res.titreNettoye || null;
    row.getCell(m.fr.description).value = res.descriptionNettoyee || null;
    for (const [code, t] of Object.entries(res.traductions ?? {})) {
      const cols = m.langues[code as LangCode];
      if (!cols || "error" in t) continue;
      const champs = res.ecrire?.[code] ?? { titre: true, description: true };
      if (champs.titre) row.getCell(cols.titre).value = t.titre || null;
      if (champs.description)
        row.getCell(cols.description).value = t.description || null;
    }
  }
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE });
}

export interface LigneRapport {
  numero: number;
  ref: string;
  titre: string;
  statut: string;
  problemes: string;
  langues: string;
}

// Rapport séparé (le fichier Metro, lui, ne reçoit aucune colonne en plus).
export async function exporterRapport(lignes: LigneRapport[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rapport");
  ws.columns = [
    { header: "Ligne", key: "numero", width: 8 },
    { header: "Référence", key: "ref", width: 18 },
    { header: "Titre (FR d'origine)", key: "titre", width: 55 },
    { header: "Statut Metro", key: "statut", width: 34 },
    { header: "Problèmes détectés", key: "problemes", width: 70 },
    { header: "Langues", key: "langues", width: 42 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FF003A80" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFD200" },
  };
  for (const l of lignes) {
    const row = ws.addRow(l);
    row.alignment = { vertical: "top", wrapText: true };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE });
}
