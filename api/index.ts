import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(307).setHeader("Location", "https://github.com/hackclub/hcb-donor-graph").end();
}
