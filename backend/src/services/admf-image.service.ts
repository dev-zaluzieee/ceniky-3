/**
 * Server-side PNG generation from persisted ADMF form_json.
 * Customer-facing layout: section bands + tables, no surcharge breakdown.
 * Width is computed from content so columns never wrap unless they exceed the configured cap.
 */

import { ImagePage, STYLE, formatGeneratedAt } from "./image-rendering.utils";
import {
  computeAdmfCelkemBezDph,
  computeAdmfCelkemSDph,
  effectiveMontazBezDph,
  sumProductRowsBezDph,
} from "../utils/admf-order-totals";

interface AdmfPriceAffectingField {
  label?: string;
  value?: string;
}

interface AdmfProductRow {
  produkt?: string;
  ks?: number;
  cena?: number;
  sleva?: number;
  cenaPoSleve?: number;
  priceAffectingFields?: AdmfPriceAffectingField[];
}

interface AdmfImageData {
  name?: string;
  jmenoPrijmeni?: string;
  ico?: string;
  dic?: string;
  nazevFirmy?: string;
  email?: string;
  telefon?: string;
  ulice?: string;
  mesto?: string;
  psc?: string;
  typOsoby?: "soukroma" | "pravnicka";
  jinaAdresaDodani?: boolean;
  dodaciUlice?: string;
  dodaciMesto?: string;
  dodaciPsc?: string;
  typZarizeni?: string;
  parkovani?: boolean;
  zv?: string;
  platceDph?: boolean;
  typProstoru?: "bytovy" | "nebytovy";
  maZakaznikVyfocenouLamelu?: boolean;
  zvonek?: string;
  patro?: string;
  infoKParkovani?: string;
  vatRate?: number;
  productRows?: AdmfProductRow[];
  montazCenaBezDph?: number;
  montazCenaZpusob?: "auto" | "manual";
  mngSleva?: boolean;
  mngSlevaCastka?: number;
  ovtSlevaCastka?: number;
  poznamkyVyroba?: string;
  poznamkyMontaz?: string;
  kObjednani?: string;
  zalohaZaplacena?: string;
  zalohovaFaktura?: number;
  variabilniSymbol?: number;
  doplatek?: number;
  infoKZaloze?: string;
  infoKFakture?: string;
  predpokladanaDodaciDoba?: string;
  predpokladanaDobaMontaze?: string;
  datum?: string;
  podpisZakaznika?: string;
  jmenoPodpisZprostredkovatele?: string;
}

const VALUE_MAX = STYLE.defaultValueColumnMaxWidth;

export async function generateAdmfImageBuffer(raw: Record<string, unknown>): Promise<Buffer> {
  const formData = raw as AdmfImageData;
  const fd = formData as Record<string, unknown>;
  const vatRate = formData.vatRate ?? 12;

  const page = new ImagePage();

  page.titleLine(
    { text: "ADMINISTRATIVNÍ FORMULÁŘ", fontSize: STYLE.titleFontSize, bold: true },
    { text: `Vygenerováno: ${formatGeneratedAt(new Date())}`, fontSize: STYLE.smallFontSize }
  );
  if (formData.name) {
    page.text(formData.name, { fontSize: STYLE.headingFontSize });
  }
  page.spacer(8);

  const hasCustomer =
    formData.jmenoPrijmeni ||
    formData.nazevFirmy ||
    formData.ico ||
    formData.dic ||
    formData.email ||
    formData.telefon ||
    formData.ulice ||
    formData.mesto ||
    formData.psc;

  if (hasCustomer) {
    const isPravnicka = formData.typOsoby === "pravnicka";
    page.sectionBar(isPravnicka ? "Údaje firmy" : "Údaje zákazníka");
    const rows: string[][] = [];
    if (isPravnicka && formData.nazevFirmy) rows.push(["Název firmy", formData.nazevFirmy]);
    if (formData.jmenoPrijmeni) rows.push(["Jméno", formData.jmenoPrijmeni]);
    if (formData.ico) rows.push(["IČO", formData.ico]);
    if (formData.dic) rows.push(["DIČ", formData.dic]);
    if (formData.email) rows.push(["E-mail", formData.email]);
    if (formData.telefon) rows.push(["Telefon", formData.telefon]);
    if (formData.ulice) rows.push(["Adresa", formData.ulice]);
    if (formData.mesto) rows.push(["Město", formData.mesto]);
    if (formData.psc) rows.push(["PSČ", formData.psc]);
    if (rows.length > 0) {
      page.table({
        head: ["Položka", "Hodnota"],
        body: rows,
        columns: [{}, { maxWidth: VALUE_MAX }],
      });
    }
  }

  if (formData.jinaAdresaDodani && (formData.dodaciUlice || formData.dodaciMesto || formData.dodaciPsc)) {
    page.spacer(4);
    page.sectionBar("Adresa dodání");
    const dRows: string[][] = [];
    if (formData.dodaciUlice) dRows.push(["Adresa", formData.dodaciUlice]);
    if (formData.dodaciMesto) dRows.push(["Město", formData.dodaciMesto]);
    if (formData.dodaciPsc) dRows.push(["PSČ", formData.dodaciPsc]);
    page.table({
      head: ["Položka", "Hodnota"],
      body: dRows,
      columns: [{}, { maxWidth: VALUE_MAX }],
    });
  }

  page.spacer(4);
  const infoRows: string[][] = [];
  if (formData.typZarizeni) infoRows.push(["Typ zařízení", formData.typZarizeni]);
  infoRows.push(["Parkování", formData.parkovani ? "OK" : "Špatné"]);
  if (formData.zv) infoRows.push(["ZV", formData.zv]);
  infoRows.push(["Plátce DPH", formData.platceDph ? "Ano" : "Ne"]);
  infoRows.push([
    "Typ prostoru",
    (formData.typProstoru ?? "bytovy") === "bytovy" ? "Bytový" : "Nebytový",
  ]);
  infoRows.push(["Vyfocená lamela", formData.maZakaznikVyfocenouLamelu ? "Ano" : "Ne"]);
  if (formData.zvonek) infoRows.push(["Jméno na zvonku", formData.zvonek]);
  if (formData.patro) infoRows.push(["Patro", formData.patro]);
  if (formData.infoKParkovani) infoRows.push(["Info k parkování", formData.infoKParkovani]);
  infoRows.push(["Sazba DPH", `${vatRate} %`]);
  page.sectionBar("Další informace a DPH");
  page.table({
    head: ["Údaj", "Hodnota"],
    body: infoRows,
    columns: [{}, { maxWidth: VALUE_MAX }],
  });

  const productRows = formData.productRows ?? [];
  const firstRowWithPriceFields = productRows.find((r) => (r.priceAffectingFields?.length ?? 0) > 0);
  const priceField1Label = firstRowWithPriceFields?.priceAffectingFields?.[0]?.label ?? "Parametr 1";
  const priceField2Label = firstRowWithPriceFields?.priceAffectingFields?.[1]?.label ?? "Parametr 2";

  page.spacer(4);
  page.sectionBar("Záznam o jednání se zákazníkem");

  const productHead = [
    "Produkt",
    "Počet ks",
    priceField1Label,
    priceField2Label,
    "Cena (bez DPH)",
    "Sleva %",
    "Cena po slevě (bez DPH)",
    "Cena po slevě (s DPH)",
  ];

  const productBody: string[][] = productRows.map((r) => {
    const field1Value = r.priceAffectingFields?.[0]?.value ?? "";
    const field2Value = r.priceAffectingFields?.[1]?.value ?? "";
    const cenaPoSleve = r.cenaPoSleve ?? 0;
    const cenaSDph = Math.round(cenaPoSleve * (1 + vatRate / 100));
    return [
      r.produkt ?? "",
      String(r.ks ?? ""),
      field1Value,
      field2Value,
      String(r.cena ?? ""),
      String(r.sleva ?? ""),
      String(cenaPoSleve),
      String(cenaSDph),
    ];
  });

  page.table({
    head: productHead,
    body: productBody.length > 0 ? productBody : [["—", "—", "", "", "", "", "", ""]],
    fontSize: STYLE.smallFontSize,
    headFontSize: STYLE.smallFontSize,
    columns: [
      { maxWidth: VALUE_MAX },
      { align: "center" },
      { maxWidth: VALUE_MAX },
      { maxWidth: VALUE_MAX },
      { align: "right" },
      { align: "right" },
      { align: "right" },
      { align: "right" },
    ],
  });

  const totalProdukty = sumProductRowsBezDph(fd);
  const produktySDph = Math.round(totalProdukty * (1 + vatRate / 100));
  const produktyDphCastka = produktySDph - totalProdukty;

  page.spacer(4);
  page.table({
    body: [
      ["Produkty bez DPH", `${totalProdukty} Kč`],
      [`DPH z produktů (${vatRate}%)`, `${produktyDphCastka} Kč`],
      ["Produkty s DPH", `${produktySDph} Kč`],
    ],
    borderless: true,
    columns: [{ color: STYLE.muted }, { align: "right" }],
  });

  page.spacer(2);
  page.text("Součty za produkty neobsahují montáž", {
    fontSize: STYLE.smallFontSize,
    color: STYLE.muted,
  });

  const montazBezDph = effectiveMontazBezDph(fd);
  const totalBezDph = computeAdmfCelkemBezDph(fd);
  const totalSDph = computeAdmfCelkemSDph(fd);
  const dphCelkem = totalSDph - totalBezDph;

  page.spacer(6);
  page.sectionBar("Kalkulace objednávky");

  const kalkBody: string[][] = [
    ["Produkty bez DPH", `${totalProdukty} Kč`],
    ["Montáž bez DPH", `${montazBezDph} Kč`],
  ];
  if ((formData.ovtSlevaCastka ?? 0) > 0) {
    kalkBody.push(["OVT sleva (bez DPH)", `−${formData.ovtSlevaCastka} Kč`]);
  }
  if (formData.mngSleva && (formData.mngSlevaCastka ?? 0) > 0) {
    kalkBody.push(["MNG sleva (bez DPH)", `−${formData.mngSlevaCastka} Kč`]);
  }
  kalkBody.push(
    ["Celkem bez DPH", `${totalBezDph} Kč`],
    [`DPH (${vatRate}%)`, `${dphCelkem} Kč`],
    ["Celkem s DPH", `${totalSDph} Kč`]
  );

  page.table({
    head: ["Položka", "Částka"],
    body: kalkBody,
    bodyFill: STYLE.kalkFill,
    rowAltFill: "#ffffff",
    columns: [{}, { align: "right" }],
    rowClassifier: (_, label) => {
      if (label === "Celkem bez DPH" || label === "Celkem s DPH") return "bold";
      if (label.startsWith("OVT") || label.startsWith("MNG")) return "negative";
      return undefined;
    },
  });

  const poznamkyVyroba = (formData.poznamkyVyroba ?? "").trim();
  const poznamkyMontaz = (formData.poznamkyMontaz ?? "").trim();
  if (poznamkyVyroba || poznamkyMontaz) {
    page.spacer(6);
    page.sectionBar("Poznámky");
    const noteRows: string[][] = [];
    if (poznamkyVyroba) noteRows.push(["Pro výrobu", poznamkyVyroba]);
    if (poznamkyMontaz) noteRows.push(["Pro montáž", poznamkyMontaz]);
    page.table({
      head: ["Kategorie", "Text"],
      body: noteRows,
      columns: [{}, { maxWidth: VALUE_MAX }],
    });
  }

  page.spacer(6);
  page.sectionBar("Platba a montáž");
  const doplatek = formData.doplatek ?? Math.max(0, totalSDph - (formData.zalohovaFaktura ?? 0));
  const platbaRows: string[][] = [];
  if (formData.kObjednani) platbaRows.push(["K objednání", formData.kObjednani]);
  if (formData.zalohaZaplacena) platbaRows.push(["Záloha zaplacena", formData.zalohaZaplacena]);
  platbaRows.push(["Zálohová faktura (s DPH)", `${formData.zalohovaFaktura ?? 0} Kč`]);
  platbaRows.push(["Doplatek (s DPH)", `${doplatek} Kč`]);
  if (formData.variabilniSymbol) platbaRows.push(["Variabilní symbol", String(formData.variabilniSymbol)]);
  if (formData.infoKZaloze) platbaRows.push(["Info k záloze", formData.infoKZaloze]);
  if (formData.infoKFakture) platbaRows.push(["Info k faktuře", formData.infoKFakture]);
  if (formData.predpokladanaDodaciDoba) {
    platbaRows.push(["Předpokládaná dodací doba", formData.predpokladanaDodaciDoba]);
  }
  if (formData.predpokladanaDobaMontaze) {
    platbaRows.push(["Předpokládaná doba montáže", formData.predpokladanaDobaMontaze]);
  }
  if (formData.datum) platbaRows.push(["Datum", formData.datum]);
  if (formData.podpisZakaznika) platbaRows.push(["Podpis zákazníka", formData.podpisZakaznika]);
  if (formData.jmenoPodpisZprostredkovatele) {
    platbaRows.push(["Zprostředkovatel", formData.jmenoPodpisZprostredkovatele]);
  }

  page.table({
    head: ["Položka", "Hodnota"],
    body: platbaRows,
    columns: [{}, { maxWidth: VALUE_MAX, align: "left" }],
    rowClassifier: (_, label) =>
      label === "Zálohová faktura (s DPH)" || label === "Doplatek (s DPH)" ? "bold" : undefined,
  });

  return page.toPng();
}
