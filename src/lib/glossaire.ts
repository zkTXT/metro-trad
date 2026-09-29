import { promises as fs } from "fs";
import path from "path";
import { LANGUES } from "./translate";

export interface Correction {
  id: string;
  langue: string;
  mauvais: string;
  bon: string;
}

const FICHIER = path.join(process.cwd(), "data", "glossaire.json");

export const langueValide = (code: string) =>
  LANGUES.some((l) => l.code === code);

export async function lireGlossaire(): Promise<Correction[]> {
  try {
    return JSON.parse(await fs.readFile(FICHIER, "utf-8")) as Correction[];
  } catch {
    return [];
  }
}

export async function ecrireGlossaire(entries: Correction[]) {
  await fs.mkdir(path.dirname(FICHIER), { recursive: true });
  await fs.writeFile(FICHIER, JSON.stringify(entries, null, 2) + "\n", "utf-8");
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function adapterCasse(trouve: string, remplacement: string): string {
  if (trouve.length > 1 && trouve === trouve.toUpperCase())
    return remplacement.toUpperCase();
  if (trouve[0] !== trouve[0].toLowerCase()) {
    return remplacement[0].toUpperCase() + remplacement.slice(1);
  }
  return remplacement;
}

// Remplace les mauvaises traductions connues, mot entier, en gardant la casse.
export function appliquerGlossaire(
  texte: string,
  langue: string,
  entries: Correction[],
): { texte: string; nb: number } {
  let nb = 0;
  let out = texte;
  for (const e of entries) {
    if (e.langue !== langue || !e.mauvais.trim()) continue;
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegex(e.mauvais)}(?![\\p{L}\\p{N}])`,
      "giu",
    );
    out = out.replace(re, (m) => {
      nb++;
      return adapterCasse(m, e.bon);
    });
  }
  return { texte: out, nb };
}
