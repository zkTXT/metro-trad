import { randomUUID } from "crypto";
import {
  ecrireGlossaire,
  langueValide,
  lireGlossaire,
  type Correction,
} from "@/lib/glossaire";

export async function GET() {
  return Response.json({ corrections: await lireGlossaire() });
}

export async function POST(request: Request) {
  const b = (await request
    .json()
    .catch(() => null)) as Partial<Correction> | null;
  const langue = typeof b?.langue === "string" ? b.langue : "";
  const mauvais = typeof b?.mauvais === "string" ? b.mauvais.trim() : "";
  const bon = typeof b?.bon === "string" ? b.bon.trim() : "";

  if (!langueValide(langue) || !mauvais || !bon) {
    return Response.json(
      { error: "Langue, mot à remplacer et remplacement requis" },
      { status: 400 },
    );
  }
  if (mauvais.length > 100 || bon.length > 100) {
    return Response.json({ error: "Texte trop long" }, { status: 413 });
  }
  if (mauvais.toLowerCase() === bon.toLowerCase()) {
    return Response.json(
      { error: "Les deux mots sont identiques" },
      { status: 400 },
    );
  }

  const entries = await lireGlossaire();
  if (
    entries.some(
      (e) =>
        e.langue === langue &&
        e.mauvais.toLowerCase() === mauvais.toLowerCase(),
    )
  ) {
    return Response.json(
      { error: "Cette correction existe déjà" },
      { status: 409 },
    );
  }
  entries.push({ id: randomUUID(), langue, mauvais, bon });
  try {
    await ecrireGlossaire(entries);
  } catch {
    return Response.json(
      { error: "Impossible d'enregistrer (fichier en lecture seule ?)" },
      { status: 500 },
    );
  }
  return Response.json({ corrections: entries });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const entries = (await lireGlossaire()).filter((e) => e.id !== id);
  try {
    await ecrireGlossaire(entries);
  } catch {
    return Response.json(
      { error: "Impossible d'enregistrer" },
      { status: 500 },
    );
  }
  return Response.json({ corrections: entries });
}
