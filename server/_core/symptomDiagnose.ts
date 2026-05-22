import type { Express, Request, Response } from "express";
import { runSymptomDiagnosis } from "../../lib/symptom-diagnose-core";

export function registerSymptomDiagnoseRoutes(app: Express): void {
  app.post("/api/symptom-diagnose", async (req: Request, res: Response) => {
    try {
      const symptoms = typeof req.body?.symptoms === "string" ? req.body.symptoms : "";
      const vehicleInfo =
        typeof req.body?.vehicleInfo === "string" ? req.body.vehicleInfo : "Not specified";

      const result = await runSymptomDiagnosis(symptoms, vehicleInfo);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to diagnose symptoms";
      const status =
        message.includes("not configured") ? 503 : message.includes("more detail") ? 400 : 500;
      console.error("[symptom-diagnose]", err);
      res.status(status).json({ error: message });
    }
  });
}
