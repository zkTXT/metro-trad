import type { LangCode } from "./translate";

// Consignes de sécurité standard, ajoutées dans « Product safety instructions XX ».
export const CONSIGNES_SECURITE: Record<"fr" | LangCode, string> = {
  fr: "Aucun avertissement de sécurité spécifique ne s’applique lorsque le produit est utilisé conformément à sa destination.",
  de: "Es gelten keine spezifischen Sicherheitswarnungen, wenn das Produkt bestimmungsgemäß verwendet wird.",
  es: "No se aplican advertencias de seguridad específicas cuando el producto se utiliza conforme a su uso previsto",
  hr: "Ne primjenjuju se posebna sigurnosna upozorenja kada se proizvod koristi u skladu s njegovom namjenom.",
  it: "Nessuna avvertenza di sicurezza specifica si applica quando il prodotto è utilizzato conformemente alla sua destinazione.",
  nl: "Er zijn geen specifieke veiligheidswaarschuwingen van toepassing wanneer het product wordt gebruikt overeenkomstig het beoogde gebruik.",
  "pt-PT":
    "Não se aplicam avisos de segurança específicos quando o produto é utilizado de acordo com a sua finalidade prevista.",
};
