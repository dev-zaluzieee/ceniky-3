/**
 * API routes for ARES (Administrativní registr ekonomických subjektů) lookups.
 * Proxies requests to the Czech government ARES API.
 */

import { Router, Response } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.middleware";

const router = Router();

/** Simplified response returned to the frontend. */
interface AresLookupResult {
  ico: string;
  dic?: string;
  obchodniJmeno: string;
  ulice: string;
  mesto: string;
  psc: string;
}

/**
 * GET /api/ares/:ico
 * Look up a company by IČO in the ARES register.
 */
router.get("/:ico", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const ico = req.params.ico as string;

  // Validate: IČO must be 1-8 digits
  if (!ico || !/^\d{1,8}$/.test(ico.trim())) {
    return res.status(400).json({
      success: false,
      error: "IČO musí být 1–8 číslic.",
    });
  }

  try {
    const aresUrl = `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico.trim()}`;
    const aresRes = await fetch(aresUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (aresRes.status === 404) {
      return res.status(404).json({
        success: false,
        error: "Subjekt s tímto IČO nebyl nalezen v registru ARES.",
      });
    }

    if (!aresRes.ok) {
      console.error(`ARES API returned ${aresRes.status}`);
      return res.status(502).json({
        success: false,
        error: "Registr ARES je momentálně nedostupný. Zkuste to později.",
      });
    }

    const data: any = await aresRes.json();

    // Build street address from components
    const sidlo = data.sidlo || {};
    let ulice = "";
    if (sidlo.nazevUlice) {
      ulice = sidlo.nazevUlice;
      if (sidlo.cisloDomovni) {
        ulice += ` ${sidlo.cisloDomovni}`;
        if (sidlo.cisloOrientacni) {
          ulice += `/${sidlo.cisloOrientacni}`;
        }
      }
    } else if (sidlo.textovaAdresa) {
      // Fallback to full text address
      ulice = sidlo.textovaAdresa;
    }

    const result: AresLookupResult = {
      ico: data.ico || ico.trim(),
      dic: data.dic || undefined,
      obchodniJmeno: data.obchodniJmeno || "",
      ulice,
      mesto: sidlo.nazevObce || "",
      psc: sidlo.psc ? String(sidlo.psc) : "",
    };

    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        error: "Požadavek na ARES vypršel. Zkuste to později.",
      });
    }
    console.error("ARES lookup error:", error);
    return res.status(500).json({
      success: false,
      error: "Nepodařilo se vyhledat subjekt v registru ARES.",
    });
  }
});

export default router;
