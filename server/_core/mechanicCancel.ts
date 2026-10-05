import type { Express, Request, Response } from "express";
import { releaseServiceRequestFromMechanic } from "../../lib/mechanic-cancel-service";

function getSessionToken(req: Request): string {
  const authHeader = req.headers.authorization || "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

export function registerMechanicCancelRoutes(app: Express): void {
  app.post("/api/mechanic-cancel", async (req: Request, res: Response) => {
    const result = await releaseServiceRequestFromMechanic({
      sessionToken: getSessionToken(req),
      requestId: req.body?.requestId,
    });
    res.status(result.status).json(result.body);
  });
}
