import { Hono } from "hono";
import pLimit from "p-limit";
import { generateAvatarGridImage } from "./image";

const avatarCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

// Concurrency & retry settings
const CONCURRENCY = 24;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF = 250; // ms
const DONATION_PAGES = 15;
const DONATIONS_PER_PAGE = 100;
const FETCH_TIMEOUT_MS = 1800;
const MAX_AVATARS = 64;

const limit = pLimit(CONCURRENCY);

async function fetchAvatarBase64(url: string, attempt = 1) {
  const now = Date.now();
  const cached = avatarCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.base64;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 429 && attempt <= MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After") || 1) * 1000;
      const backoff = Math.max(INITIAL_BACKOFF * attempt, retryAfter);
      console.warn(`429 on ${url}, retrying after ${backoff}ms (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, backoff));
      return fetchAvatarBase64(url, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    const mime = res.headers.get("Content-Type") || "image/png";
    const base64 = `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
    avatarCache.set(url, { base64, expiresAt: now + CACHE_TTL });
    return base64;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF * Math.pow(2, attempt - 1);
      console.warn(`Error fetching ${url} (${err}), retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
      return fetchAvatarBase64(url, attempt + 1);
    }
    console.error(`Failed to fetch ${url} after ${attempt} attempts:`, err);
    throw err;
  }
}

async function downloadAllAvatars(urls: string[]) {
  const tasks = urls.map((url) =>
    limit(() =>
      fetchAvatarBase64(url).catch(() => null)
    )
  );
  const results = await Promise.all(tasks);
  return results.filter((b) => b !== null);
}

async function fetchDonationPage(orgSlug: string, iconSize: number, page: number) {
  return fetch(
    `https://hcb.hackclub.com/api/v3/organizations/${orgSlug}/donations?per_page=${DONATIONS_PER_PAGE}&page=${page}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  )
    .then((r) => (r.ok ? r.json() : []))
    .then((data) =>
      (Array.isArray(data) ? data : [])
        .map((d: any) => d.donor?.avatar?.replace("/128/", `/${iconSize}/`))
        .filter(Boolean)
    )
    .catch(() => []);
}

async function collectAvatarUrls(orgSlug: string, iconSize: number, limitCount: number) {
  const uniqueUrls = new Set<string>();

  const initialPages = Math.min(
    DONATION_PAGES,
    Math.max(1, Math.ceil(limitCount / DONATIONS_PER_PAGE))
  );

  const firstBatch = await Promise.all(
    Array.from({ length: initialPages }, (_, i) =>
      fetchDonationPage(orgSlug, iconSize, i + 1)
    )
  );

  for (const page of firstBatch) {
    for (const url of page) {
      uniqueUrls.add(url);
      if (uniqueUrls.size >= limitCount) {
        return [...uniqueUrls].slice(0, limitCount);
      }
    }
  }

  for (let page = initialPages + 1; page <= DONATION_PAGES; page++) {
    const urls = await fetchDonationPage(orgSlug, iconSize, page);
    if (urls.length === 0) {
      break;
    }

    for (const url of urls) {
      uniqueUrls.add(url);
      if (uniqueUrls.size >= limitCount) {
        return [...uniqueUrls].slice(0, limitCount);
      }
    }
  }

  return [...uniqueUrls].slice(0, limitCount);
}

const app = new Hono();

app.get("/:orgslug", async (c) => {
  const orgSlug = c.req.param("orgslug");
  const iconSize = Number(c.req.query("icon_size")) || 64;
  const gap = Number(c.req.query("gap")) || 12;
  const widthParam = Number(c.req.query("width")) || 0;
  const heightParam = Number(c.req.query("height")) || 0;
  const maxColumns = Number(c.req.query("max_columns")) || 15;
  const maxRows = Number(c.req.query("max_rows")) || 20;

  console.log(`Generating grid for ${orgSlug}, size ${iconSize}, gap ${gap} `);

  // fetch donation pages based on required avatar count
  const requestedCount = isFinite(maxRows) ? maxColumns * maxRows : MAX_AVATARS;
  const limitCount = Math.min(requestedCount, MAX_AVATARS);
  console.time("fetchDonations");
  const avatarUrls = await collectAvatarUrls(orgSlug, iconSize, limitCount);
  console.timeEnd("fetchDonations");

  // determine layout based off number of avatars
  const count = avatarUrls.length;
  let columns = count === 0 ? 1 : Math.min(maxColumns, count);
  let rows = count === 0 ? 1 : Math.ceil(count / columns);
  if (rows > maxRows) rows = maxRows;

  // calculate dimensions if not provided
  const width =
    widthParam > 0
      ? widthParam
      : gap + columns * iconSize + gap * (columns - 1) + gap;
  const height =
    heightParam > 0
      ? heightParam
      : gap + rows * iconSize + gap * (rows - 1) + gap;

  console.log(`Layout: ${columns} cols x ${rows} rows => ${width}x${height}px`);

  console.time("downloadAvatars");
  const avatarsBase64 = await downloadAllAvatars(avatarUrls);
  console.timeEnd("downloadAvatars");

  console.time("generateImage");
  const img = await generateAvatarGridImage(
    width,
    height,
    avatarsBase64,
    iconSize,
    gap,
    orgSlug
  );
  console.timeEnd("generateImage");

  c.header("Content-Type", "image/png");
  c.header("Cache-Control", "public, max-age=43200, must-revalidate");
  return c.body(img);
});

app.get("*", (c) => c.redirect("https://github.com/hackclub/hcb-donor-graph"));

export default app;
