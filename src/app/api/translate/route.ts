import { LANGUES, translateText } from "@/lib/translate";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    titre?: unknown;
    description?: unknown;
  } | null;

  const titre = typeof body?.titre === "string" ? body.titre : "";
  const description = typeof body?.description === "string" ? body.description : "";

  if (!titre.trim() && !description.trim()) {
    return Response.json({ error: "Aucun texte à traduire" }, { status: 400 });
  }
  if (titre.length > 5000 || description.length > 20000) {
    return Response.json({ error: "Texte trop long" }, { status: 413 });
  }

  const traductions: Record<
    string,
    { titre: string; description: string } | { error: string }
  > = {};

  // 3 langues en parallèle au maximum, pour rester poli avec les services gratuits.
  const file = [...LANGUES];
  const worker = async () => {
    for (let l = file.shift(); l; l = file.shift()) {
      const { code } = l;
      try {
        const t = await translateText(titre, code);
        const d = await translateText(description, code);
        traductions[code] = { titre: t, description: d };
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

  return Response.json({ traductions });
}
