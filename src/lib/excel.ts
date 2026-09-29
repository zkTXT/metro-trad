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
): Promise<Blob> {
  const debut = Math.max(ws.actualColumnCount, ws.columnCount) + 1;
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
