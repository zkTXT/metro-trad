import { appliquerGlossaire, lireGlossaire } from "@/lib/glossaire";
import { sauverMemoire, traduireTextes } from "@/lib/memoire";
import { LANGUES } from "@/lib/translate";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    titre?: unknown;
    description?: unknown;
    sansMemoire?: unknown;
    import?: unknown;
  } | null;

  const titre = typeof body?.titre === "string" ? body.titre : "";
  const description =
    typeof body?.description === "string" ? body.description : "";
  const sansMemoire = body?.sansMemoire === true;
  // Import Excel : on ralentit fortement pour ne pas se faire bloquer par Google.
  const cooldownMs = body?.import === true ? 4000 : 300;

  if (!titre.trim() && !description.trim()) {
    return Response.json({ error: "Aucun texte à traduire" }, { status: 400 });
  }
  if (titre.length > 5000 || description.length > 20000) {
    return Response.json({ error: "Texte trop long" }, { status: 413 });
  }

  const traductions: Record<
    string,
    | {
        titre: string;
        description: string;
        corrections: number;
        reprises: number;
        nouvelles: number;
      }
    | { error: string }
  > = {};
  const glossaire = await lireGlossaire();

  // 3 langues en parallèle au maximum, pour rester poli avec les services gratuits.
  const file = [...LANGUES];
  const worker = async () => {
    for (let l = file.shift(); l; l = file.shift()) {
      const { code } = l;
      try {
        const [t, d] = await traduireTextes([titre, description], code, {
          sansMemoire,
          cooldownMs,
        });
        // Le glossaire s'applique après la mémoire : une correction agit tout de suite.
        const gt = appliquerGlossaire(t.texte, code, glossaire);
        const gd = appliquerGlossaire(d.texte, code, glossaire);
        traductions[code] = {
          titre: gt.texte,
          description: gd.texte,
          corrections: gt.nb + gd.nb,
          reprises: t.reprises + d.reprises,
          nouvelles: t.nouvelles + d.nouvelles,
        };
      } catch (e) {
        console.error(`[translate] ${code} :`, e);
        traductions[code] = {
          error:
            "Le service de traduction gratuit est temporairement saturé. Patientez une à deux minutes puis réessayez. (" +
            (e instanceof Error ? e.message : "erreur inconnue") +
            ")",
        };
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  await sauverMemoire();

  return Response.json({ traductions });
}
