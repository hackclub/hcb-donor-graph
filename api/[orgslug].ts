import type { VercelRequest, VercelResponse } from "@vercel/node";
import sharp from "sharp";

const DONATIONS_PER_PAGE = 100;
const MAX_AVATARS = DONATIONS_PER_PAGE;
const MAX_DONATION_PAGES = 6;
const DEFAULT_ICON_SIZE = 64;
const DEFAULT_GAP = 12;
const DEFAULT_MAX_COLUMNS = 15;
const DEFAULT_MAX_ROWS = 20;
const FETCH_TIMEOUT_MS = 2500;
const AVATAR_FETCH_TIMEOUT_MS = 1200;
const AVATAR_CONCURRENCY = 12;
const AVATAR_CACHE_TTL = 1000 * 60 * 60 * 24;

const avatarDataCache = new Map<string, { dataUrl: string; expiresAt: number }>();

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function buildMessageSvg(width: number, height: number, message: string) {
  const safeMessage = message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Donor Graph">
  <rect x="0" y="0" width="100%" height="100%" fill="#111315" />
  <text x="50%" y="50%" fill="#98a0ad" dominant-baseline="middle" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI" font-size="22">${safeMessage}</text>
</svg>`;
}

function buildAvatarGridSvg(
  width: number,
  height: number,
  avatarUrls: string[],
  iconSize: number,
  gap: number,
  columns: number
) {
  const defs = avatarUrls
    .map((_, index) => {
      const radius = iconSize / 2;
      const cx = radius;
      const cy = radius;
      return `<clipPath id="clip-${index}"><circle cx="${cx}" cy="${cy}" r="${radius}" /></clipPath>`;
    })
    .join("");

  const images = avatarUrls
    .map((url, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = gap + col * (iconSize + gap);
      const y = gap + row * (iconSize + gap);
      const safeUrl = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

      return `<g transform="translate(${x}, ${y})">
  <rect x="0" y="0" width="${iconSize}" height="${iconSize}" rx="${iconSize / 2}" ry="${iconSize / 2}" fill="#2a2f36" />
  <image href="${safeUrl}" x="0" y="0" width="${iconSize}" height="${iconSize}" clip-path="url(#clip-${index})" preserveAspectRatio="xMidYMid slice" />
</g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Donor Graph">
  <rect x="0" y="0" width="100%" height="100%" fill="#111315" />
  <defs>${defs}</defs>
  ${images}
</svg>`;
}

async function collectAvatarUrls(
  orgSlug: string,
  iconSize: number,
  wanted: number
): Promise<{ avatarUrls: string[]; notFound: boolean }> {
  const target = Math.min(wanted, MAX_AVATARS);
  const uniqueUrls = new Set<string>();

  for (let page = 1; page <= MAX_DONATION_PAGES; page++) {
    const donationUrl = `https://hcb.hackclub.com/api/v3/organizations/${orgSlug}/donations?per_page=${DONATIONS_PER_PAGE}&page=${page}`;

    try {
      const response = await fetch(donationUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.status === 404 && page === 1) {
        return { avatarUrls: [], notFound: true };
      }
      if (!response.ok) {
        continue;
      }

      const json = await response.json();
      const data = Array.isArray(json) ? json : [];
      if (data.length === 0) {
        break;
      }

      for (const d of data) {
        const avatar = d?.donor?.avatar?.replace("/128/", `/${iconSize}/`);
        if (typeof avatar === "string" && avatar.length > 0) {
          uniqueUrls.add(avatar);
          if (uniqueUrls.size >= target) {
            return { avatarUrls: [...uniqueUrls].slice(0, target), notFound: false };
          }
        }
      }
    } catch {
      continue;
    }
  }

  return { avatarUrls: [...uniqueUrls].slice(0, target), notFound: false };
}

async function fetchAvatarDataUrl(url: string): Promise<string | null> {
  const cached = avatarDataCache.get(url);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.dataUrl;
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      return null;
    }

    const mime = response.headers.get("Content-Type") || "image/png";
    const bytes = await response.arrayBuffer();
    const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    avatarDataCache.set(url, { dataUrl, expiresAt: now + AVATAR_CACHE_TTL });
    return dataUrl;
  } catch {
    return null;
  }
}

async function embedAvatarUrls(urls: string[]): Promise<string[]> {
  const output: string[] = [];

  for (let i = 0; i < urls.length; i += AVATAR_CONCURRENCY) {
    const chunk = urls.slice(i, i + AVATAR_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map((url) => fetchAvatarDataUrl(url)));
    for (let j = 0; j < chunk.length; j++) {
      output.push(chunkResults[j] ?? chunk[j]);
    }
  }

  return output;
}

async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const orgSlug = req.query.orgslug;
  if (typeof orgSlug !== "string" || orgSlug.length === 0) {
    res.status(307).setHeader("Location", "https://github.com/hackclub/hcb-donor-graph").end();
    return;
  }

  const iconSize = clamp(Number(req.query.icon_size) || DEFAULT_ICON_SIZE, 20, 256);
  const gap = clamp(Number(req.query.gap) || DEFAULT_GAP, 0, 64);
  const maxColumns = clamp(Number(req.query.max_columns) || DEFAULT_MAX_COLUMNS, 1, 100);
  const maxRows = clamp(Number(req.query.max_rows) || DEFAULT_MAX_ROWS, 1, 100);
  const format = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "png";

  const requestedCount = maxColumns * maxRows;
  const { avatarUrls, notFound } = await collectAvatarUrls(orgSlug, iconSize, requestedCount);
  if (notFound) {
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    res.status(404).send("Organization not found");
    return;
  }
  const embeddedAvatarUrls = await embedAvatarUrls(avatarUrls);

  const columns = Math.max(1, Math.min(maxColumns, embeddedAvatarUrls.length || maxColumns));
  const rows = Math.max(1, Math.ceil(Math.max(1, embeddedAvatarUrls.length) / columns));

  const width = gap + columns * iconSize + gap * (columns - 1) + gap;
  const height = gap + rows * iconSize + gap * (rows - 1) + gap;

  const svg =
    embeddedAvatarUrls.length > 0
      ? buildAvatarGridSvg(width, height, embeddedAvatarUrls, iconSize, gap, columns)
      : buildMessageSvg(width, height, `No donors yet for ${orgSlug}`);

  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");

  if (format === "svg") {
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.status(200).send(svg);
    return;
  }

  try {
    const png = await svgToPng(svg);
    res.setHeader("Content-Type", "image/png");
    res.status(200).send(png);
  } catch {
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.status(200).send(svg);
  }
}
