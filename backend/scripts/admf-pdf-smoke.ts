/**
 * One-shot smoke test for admf-pdf.service.ts — builds a sample PDF with
 * representative data and writes it to /tmp/admf-smoke.pdf so a human can
 * open it and eyeball the layout.
 *
 * Run with:  npx ts-node scripts/admf-pdf-smoke.ts
 */

import { writeFile } from "node:fs/promises";
import { generateAdmfPdfBuffer } from "../src/services/admf-pdf.service";

const sample: Record<string, unknown> = {
  name: "Varianta 1 — vzorová objednávka",
  jmenoPrijmeni: "Jan Novák",
  ico: "12345678",
  dic: "CZ12345678",
  email: "jan.novak@example.cz",
  telefon: "+420 123 456 789",
  ulice: "Hlavní 1",
  mesto: "Praha",
  castMesta: "Smíchov",
  psc: "120 00",
  bytRdFirma: "BYT",
  typOsoby: "soukroma",
  patro: "3",
  zv: "12B",
  parkovani: true,
  maZakaznikVyfocenouLamelu: false,
  platceDph: false,
  faktura: true,
  typProstoru: "bytovy",
  vatRate: 12,
  productRows: [
    {
      produkt: "Horizontální žaluzie PRIM 800×1200",
      ks: 2,
      cena: 5000,
      sleva: 10,
      cenaPoSleve: 4500,
      priceAffectingFields: [
        { code: "ram", label: "rám", value: "stříbrný" },
        { code: "lamela", label: "lamela", value: "203" },
      ],
    },
    {
      produkt: "Vertikální žaluzie ALU 1500×2000",
      ks: 1,
      cena: 8200,
      sleva: 0,
      cenaPoSleve: 8200,
      priceAffectingFields: [
        { code: "ram", label: "rám", value: "bílý" },
        { code: "lamela", label: "lamela", value: "501" },
      ],
    },
  ],
  montazCenaBezDph: 1339,
  ovtSlevaSDph: 0,
  mngSleva: false,
  doplnujiciInformaceObjednavky:
    "Standardní provedení, barva bílá. Délka šňůr 1500 mm. Klient si přeje montáž do otvoru.",
  doplnujiciInformaceMontaz:
    "Montáž po dohodě se zákazníkem, vstup z ulice. Parkování ve dvoře.",
  kObjednani: "CELÁ ZAKÁZKA",
  zalohovaFaktura: 5000,
  doplatek: 14117,
  variabilniSymbol: 420123456789,
  predpokladanaDodaciDoba: "4–6 týdnů",
  kodTerminalu: "T-007",
  dobaMontaze: "2 hodiny",
  datum: "11. 5. 2026",
  podpisZakaznika: "",
  jmenoPodpisZprostredkovatele: "P. Hogh",
};

(async () => {
  const buffer = await generateAdmfPdfBuffer(sample);
  const out = "/tmp/admf-smoke.pdf";
  await writeFile(out, buffer);
  console.log(`Wrote ${buffer.length} bytes → ${out}`);
})().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
