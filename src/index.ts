import { Hono } from "hono";

const DONATIONS_PER_PAGE = 100;
const DONATION_PAGE = 1;
const MAX_AVATARS = 20;
const DEFAULT_ICON_SIZE = 64;
const DEFAULT_GAP = 12;
const DEFAULT_MAX_COLUMNS = 9;
const DEFAULT_MAX_ROWS = 4;
const FETCH_TIMEOUT_MS = 900;

const app = new Hono();

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

app.get("/:orgslug", async (c) => {
  const orgSlug = c.req.param("orgslug");
  const iconSize = clamp(Number(c.req.query("icon_size")) || DEFAULT_ICON_SIZE, 20, 256);
  const gap = clamp(Number(c.req.query("gap")) || DEFAULT_GAP, 0, 64);
  const maxColumns = clamp(
    Number(c.req.query("max_columns")) || DEFAULT_MAX_COLUMNS,
    1,
    DEFAULT_MAX_COLUMNS
  );
  const maxRows = clamp(Number(c.req.query("max_rows")) || DEFAULT_MAX_ROWS, 1, DEFAULT_MAX_ROWS);

  const requestedCount = maxColumns * maxRows;
  const limitCount = Math.min(requestedCount, MAX_AVATARS);

  const donationUrl = `https://hcb.hackclub.com/api/v3/organizations/${orgSlug}/donations?per_page=${DONATIONS_PER_PAGE}&page=${DONATION_PAGE}`;

  let data: any[] = [];
  try {
    const response = await fetch(donationUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.ok) {
      const json = await response.json();
      data = Array.isArray(json) ? json : [];
    }
  } catch {
    data = [];
  }

  const avatarUrls = [...new Set(
    data
      .map((d: any) => d?.donor?.avatar?.replace("/128/", `/${iconSize}/`))
      .filter((url: unknown): url is string => typeof url === "string" && url.length > 0)
  )].slice(0, limitCount);

  const columns = Math.max(1, Math.min(maxColumns, avatarUrls.length || maxColumns));
  const rows = Math.max(1, Math.ceil(Math.max(1, avatarUrls.length) / columns));

  const width = gap + columns * iconSize + gap * (columns - 1) + gap;
  const height = gap + rows * iconSize + gap * (rows - 1) + gap;

  const svg =
    avatarUrls.length > 0
      ? buildAvatarGridSvg(width, height, avatarUrls, iconSize, gap, columns)
      : buildMessageSvg(width, height, `No donors yet for ${orgSlug}`);

  c.header("Content-Type", "image/svg+xml; charset=utf-8");
  c.header("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
  return c.body(svg);
});

app.get("*", (c) => c.redirect("https://github.com/hackclub/hcb-donor-graph"));

export default app;
