import { promises as fs } from "fs";
import path from "path";
import { traduireBrut, type LangCode } from "./translate";

// Mémoire des traductions : chaque phrase déjà traduite est gardée (par langue) et
// n'est plus renvoyée aux moteurs gratuits. Stockée dans data/memoire.json.

const FICHIER = path.join(process.cwd(), "data", "memoire.json");
const MAX_ENTREES = 20000;

let cache: Map<string, string> | null = null;
let modifie = false;

const cle = (to: string, phrase: string) => `${to}\u0000${phrase}`;

async function charger(): Promise<Map<string, string>> {
  if (cache) return cache;
  try {
    const data = JSON.parse(await fs.readFile(FICHIER, "utf-8")) as Record<
      string,
      string
    >;
    cache = new Map(Object.entries(data));
  } catch {
    cache = new Map();
  }
  return cache;
}

export async function sauverMemoire() {
  if (!cache || !modifie) return;
  try {
    await fs.mkdir(path.dirname(FICHIER), { recursive: true });
    await fs.writeFile(
      FICHIER,
      JSON.stringify(Object.fromEntries(cache)),
      "utf-8",
    );
    modifie = false;
  } catch (e) {
    console.error("[memoire] écriture impossible :", e);
  }
}

export async function viderMemoire() {
  cache = new Map();
  modifie = true;
  await sauverMemoire();
}

export async function tailleMemoire() {
  return (await charger()).size;
}

// Coupe une ligne en phrases, uniquement là où un point est suivi d'un espace
// (« 1.5 m » n'est pas coupé).
const phrases = (ligne: string) =>
  ligne
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

export interface ResultatMemoire {
  texte: string;
  reprises: number; // phrases servies par la mémoire
  nouvelles: number; // phrases envoyées aux moteurs
}

export async function traduireAvecMemoire(
  text: string,
  to: LangCode,
  opts: { sansMemoire?: boolean } = {},
): Promise<ResultatMemoire> {
  if (!text.trim()) return { texte: "", reprises: 0, nouvelles: 0 };
  const memoire = await charger();

  const lignes = text.split("\n").map((l) => (l.trim() ? phrases(l) : null));
  const uniques = new Set(lignes.flatMap((l) => l ?? []));

  const manquantes = [...uniques].filter(
    (p) => opts.sansMemoire || !memoire.has(cle(to, p)),
  );
  const manquantesSet = new Set(manquantes);

  if (manquantes.length > 0) {
    // Un seul envoi pour toutes les phrases manquantes (une phrase par ligne).
    const brut = (await traduireBrut(manquantes.join("\n"), to)).split("\n");
    const traduites =
      brut.length === manquantes.length
        ? brut
        : await Promise.all(manquantes.map((m) => traduireBrut(m, to)));
    for (let i = 0; i < manquantes.length; i++) {
      const p = manquantes[i];
      let t = traduites[i]?.trim();
      if (!t) t = (await traduireBrut(p, to)).trim(); // un moteur renvoie parfois du vide
      if (!t) throw new Error(`Traduction vide pour « ${p} »`);
      memoire.set(cle(to, p), t);
    }
    modifie = true;
    while (memoire.size > MAX_ENTREES) {
      memoire.delete(memoire.keys().next().value as string);
    }
  }

  let reprises = 0;
  const texte = lignes
    .map((l) => {
      if (!l) return "";
      return l
        .map((p) => {
          if (!manquantesSet.has(p)) reprises++;
          return memoire.get(cle(to, p)) as string;
        })
        .join(" ");
    })
    .join("\n");

  return { texte, reprises, nouvelles: manquantes.length };
}
