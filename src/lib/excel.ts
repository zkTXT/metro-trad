// Lecture / écriture des fichiers Excel, entièrement dans le navigateur
// (le fichier n'est jamais envoyé au serveur).
import type { Workbook, Worksheet } from "exceljs";
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

export async function lireClasseur(file: File): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
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
}

export function detecterModeleMetro(ws: Worksheet): ModeleMetro | null {
  const largeur = Math.max(ws.actualColumnCount, ws.columnCount);
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const titres: Record<string, number> = {};
    const descriptions: Record<string, number> = {};
    let ref = 0;
    for (let c = 1; c <= largeur; c++) {
      const t = texte(row.getCell(c));
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
      };
    }
  }
  return null;
}

export interface LigneMetro extends LigneSource {
  ref: string;
  existant: Partial<Record<LangCode, { titre: string; description: string }>>;
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
): Promise<Blob> {
  for (const [numero, res] of resultats) {
    const row = ws.getRow(numero);
    row.getCell(m.fr.titre).value = res.titreNettoye || null;
    row.getCell(m.fr.description).value = res.descriptionNettoyee || null;
    for (const [code, t] of Object.entries(res.traductions ?? {})) {
      const cols = m.langues[code as LangCode];
      if (!cols || "error" in t) continue;
      row.getCell(cols.titre).value = t.titre || null;
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
