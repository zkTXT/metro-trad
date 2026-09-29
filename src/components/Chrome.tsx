"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ONGLETS = [
  { href: "/", label: "Fiche produit" },
  { href: "/import", label: "Import Excel" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="bg-metro text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sun text-xl font-black text-metro-dark">
          M
        </div>
        <div>
          <h1 className="text-xl font-extrabold leading-tight sm:text-2xl">
            Metro Trad
            <span className="ml-2 align-middle text-sm font-semibold text-sun">
              by Bistromania
            </span>
          </h1>
          <p className="text-sm text-blue-100">
            Vérifiez, nettoyez et traduisez vos fiches produit avant
            l&apos;envoi sur Metro
          </p>
        </div>
        <a
          href="https://www.metro-selleroffice.com/fr/workplace/products/my-products/approved"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto rounded-xl bg-sun px-4 py-2.5 text-sm font-extrabold text-metro-dark shadow-sm transition hover:bg-sun-dark"
        >
          Ma boutique Metro ↗
        </a>
      </div>
      <nav className="mx-auto flex max-w-7xl gap-1 px-5">
        {ONGLETS.map((o) => {
          const actif = pathname === o.href;
          return (
            <Link
              key={o.href}
              href={o.href}
              className={`rounded-t-lg px-5 py-2 text-sm font-bold transition ${
                actif
                  ? "bg-background text-metro"
                  : "text-blue-100 hover:bg-white/10"
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </nav>
      <div className="h-1.5 bg-sun" />
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-4 border-t-4 border-sun bg-metro text-blue-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs">
        <span>
          <strong className="text-white">Bistromania</strong> · Mobilier et
          équipement CHR
        </span>
        <span>Outil interne conçu par Ilyes Zekri</span>
      </div>
    </footer>
  );
}
