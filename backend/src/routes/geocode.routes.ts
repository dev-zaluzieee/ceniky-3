/**
 * API routes for reverse geocoding via Nominatim (OpenStreetMap).
 */

import { Router, Response } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.middleware";

const router = Router();

/**
 * GET /api/geocode/reverse?lat=...&lon=...
 * Reverse-geocode GPS coordinates into a Czech address via Nominatim.
 */
router.get("/reverse", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ success: false, error: "Parametry lat a lon jsou povinné." });
  }

  const latNum = parseFloat(lat as string);
  const lonNum = parseFloat(lon as string);
  if (isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ success: false, error: "Neplatné souřadnice." });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lonNum}&format=json&addressdetails=1&accept-language=cs`;
    const nominatimRes = await fetch(url, {
      headers: {
        "User-Agent": "ceniky-3-app/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!nominatimRes.ok) {
      return res.status(502).json({ success: false, error: "Geocoding služba je momentálně nedostupná." });
    }

    const data: any = await nominatimRes.json();
    if (data.error) {
      return res.status(404).json({ success: false, error: "Pro zadané souřadnice nebyla nalezena adresa." });
    }

    const addr = data.address || {};
    const houseNumber = addr.house_number || "";
    const road = addr.road || "";
    const ulice = houseNumber ? `${road} ${houseNumber}` : road;

    return res.json({
      success: true,
      data: {
        ulice: ulice.trim(),
        mesto: addr.city || addr.town || addr.village || addr.municipality || "",
        psc: (addr.postcode || "").replace(/\s/g, ""),
      },
    });
  } catch (error: any) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({ success: false, error: "Požadavek na geocoding vypršel." });
    }
    console.error("Geocode reverse error:", error);
    return res.status(500).json({ success: false, error: "Nepodařilo se získat adresu ze souřadnic." });
  }
});

export default router;
