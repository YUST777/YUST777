// Generates README.md and the SVG cards in assets/cards from profile.config.json plus live data:
// GitHub API, the yust.dev repo (projects) and the yust.dev LinkedIn followers API.
// The README is images only; every card is an SVG drawn in the yust.dev theme.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import satori from "satori";

const cfg = JSON.parse(readFileSync("profile.config.json", "utf8"));
const token = process.env.GITHUB_TOKEN;

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "user-agent": "profile-gen", ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
const gh = (path) =>
  getJson(`https://api.github.com${path}`, token ? { authorization: `Bearer ${token}` } : {});
const raw = async (path) => {
  const { repo, branch } = cfg.site;
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.text();
};
// A failed source degrades to a fallback instead of breaking the whole profile.
const safe = async (label, fn, fallback) => {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[skip] ${label}: ${e.message}`);
    return fallback;
  }
};
const field = (chunk, name) => chunk.match(new RegExp(`\\n\\s{4}${name}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];
const list = (chunk, name) =>
  [...(chunk.match(new RegExp(`\\n\\s{4}${name}:\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const clean = (s = "") =>
  s
    .replace(/\\(["'`])/g, "$1")
    .replace(/\p{Extended_Pictographic}|️/gu, "")
    .trim();
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const fmt = (n) => (n == null ? "-" : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US"));
const host = (url) => url.replace(/^\w+:\/\/(www\.)?/, "").replace(/\/$/, "");

const [user, repos, commits, linkedin, projectsSrc] = await Promise.all([
  safe("user", () => gh(`/users/${cfg.user}`), {}),
  safe("repos", () => gh(`/users/${cfg.user}/repos?per_page=100&sort=pushed`), []),
  safe("commits", async () => (await gh(`/search/commits?q=author:${cfg.user}&per_page=1`)).total_count, null),
  safe("linkedin", async () => (await getJson(cfg.site.followersApi)).followers, null),
  safe("projects", () => raw("src/components/projects/ProjectsData.ts"), ""),
]);

const stars = repos.reduce((n, r) => n + (r.stargazers_count || 0), 0);
const stats = [
  ["COMMITS", commits],
  ["STARS", stars],
  ["REPOS", user.public_repos],
  ["GITHUB", user.followers],
  ["LINKEDIN", linkedin],
];

const allProjects = projectsSrc
  .split(/\n  \{\n/)
  .slice(1)
  .map((c) => ({
    title: clean(field(c, "title")),
    desc: clean(field(c, "description")),
    tag: clean(field(c, "tag")),
    url: field(c, "siteLink"),
    tech: list(c, "technologies").map(clean),
  }));
// Featured projects come from config (title + GIF tile); text comes from the site data.
const projects = cfg.featured
  .map((f) => ({ ...allProjects.find((p) => p.title === f.title), ...f }))
  .filter((p) => p.url && p.tile);


// ---- theme (matches yust.dev) ----
const C = {
  bg: "#0c0c0c",
  card: "#0c0c0c",
  line: "#252528",
  white: "#ffffff",
  text: "#a1a1aa",
  dim: "#71717a",
  faint: "#3f3f46",
  accent: "#60a5fa",
};
const W = 1200;
const PAD = 56;
const OUT = "assets/cards";
const font = (f) => readFileSync(`assets/fonts/${f}`);
const fonts = [
  { name: "Silkscreen", data: font("silkscreen-700.ttf"), weight: 700 },
  { name: "Silkscreen", data: font("silkscreen-400.ttf"), weight: 400 },
  { name: "GeistMono", data: font("GeistMono-Regular.ttf"), weight: 400 },
];
const el = (style, children = "") => ({ type: "div", props: { style: { display: "flex", ...style }, children } });
const pixel = (size, color, text, extra = {}) =>
  el({ fontFamily: "Silkscreen", fontWeight: 700, fontSize: size, color, ...extra }, text);
const mono = (size, color, text, extra = {}) => el({ fontFamily: "GeistMono", fontSize: size, color, ...extra }, text);
const oneLine = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const card = (style, children) =>
  el({ width: "100%", height: "100%", background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, ...style }, children);
const blink = (svg) =>
  svg.replace(
    new RegExp(`(<rect[^>]*fill="${C.accent}"[^>]*)\\/>`),
    '$1><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1.1s" repeatCount="indefinite"/></rect>',
  );

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
async function draw(name, h, tree, { w = W, post = (s) => s } = {}) {
  writeFileSync(`${OUT}/${name}.svg`, post(await satori(tree, { width: w, height: h, fonts })));
  return `${OUT}/${name}.svg`;
}

// ---- cards ----
// Header row = one wide card + square icon cards, all the same height so they line up in one row.
const ROW_H = 120;
const header = await draw(
  "header",
  ROW_H,
  card({ alignItems: "center", padding: "0 44px" }, [
    pixel(40, C.white, cfg.name, { letterSpacing: 2 }),
    el({ width: 8, height: 40, background: C.accent, marginLeft: 10 }),
    el({ width: 1, height: 44, background: C.line, margin: "0 32px" }),
    mono(30, C.white, cfg.greeting),
  ]),
  { w: 1245, post: blink },
);

const ICONS = {
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.554V9h3.565v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
};
const iconSrc = (name, color) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${color}" d="${ICONS[name]}"/></svg>`).toString("base64")}`;
const socialCards = [];
for (const s of cfg.social) {
  socialCards.push(
    await draw(
      `social-${s.icon}`,
      ROW_H,
      card({ alignItems: "center", justifyContent: "center" }, [
        { type: "img", props: { src: iconSrc(s.icon, s.icon === "linkedin" ? C.accent : C.white), width: 52, height: 52 } },
      ]),
      { w: ROW_H },
    ),
  );
}

// Ticker: two identical halves side by side, slid left by one half forever = seamless loop.
const tickerItems = [...stats.map(([l, n]) => `${fmt(n)} ${l}`), ...new Set(projects.flatMap((p) => p.tech ?? []))].slice(0, 14);
const half = el(
  { width: W * 2, flexShrink: 0, alignItems: "center", justifyContent: "space-around" },
  tickerItems.flatMap((t, i) => [
    mono(17, i < stats.length ? C.white : C.dim, t.toUpperCase(), { letterSpacing: 1.5 }),
    el({ width: 6, height: 6, background: C.accent }),
  ]),
);
const ticker = await draw(
  "ticker",
  60,
  el({ width: "100%", height: "100%", background: C.bg, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }, [
    half,
    half,
  ]),
  {
    w: W * 4,
    post: (s) =>
      s
        .replace(/^<svg width="\d+" height="(\d+)" viewBox="0 0 \d+ \d+"/, `<svg width="${W}" height="$1" viewBox="0 0 ${W} $1"`)
        .replace(/(<svg[^>]*>)([\s\S]*)<\/svg>$/, (_, open, body) =>
          `${open}<g>${body}<animateTransform attributeName="transform" type="translate" from="0 0" to="${-W * 2} 0" dur="60s" repeatCount="indefinite"/></g></svg>`,
        ),
  },
);

// ---- readme: images only, alt text carries the words for screen readers ----
// Tiles in assets/tiles/*.gif are cut from the project videos (1920x1080) with ffmpeg; they are not regenerated here.
const img = (src, alt, attrs = 'width="100%"') => `<img src="${src}" ${attrs} alt="${esc(alt)}" />`;
const link = (href, inner) => `<a href="${href}">${inner}</a>`;
const block = (lines) => ["<p align=\"center\">", ...lines, "</p>", ""];
const tile = (p) => link(p.url, img(`assets/tiles/${p.tile}.gif`, `${p.title}: ${p.desc ?? ""}`, 'width="49%"'));
const rows = [];
for (let i = 0; i < projects.length; i += 2) rows.push(projects.slice(i, i + 2).map(tile).join(" ") + "<br>");

const md = [
  "<!-- Generated by scripts/gen_profile.mjs. Edit profile.config.json instead. -->",
  "",
  // no whitespace between the header images, or the row wraps
  ...block([
    link(cfg.site.url, img(header, `${cfg.greeting}. I'm ${cfg.fullName} (${cfg.name}), ${cfg.tagline}.`, 'width="83%"')) +
      cfg.social.map((s, i) => link(s.url, img(socialCards[i], s.label, 'width="8%"'))).join(""),
  ]),
  ...block(rows),
  ...block([img(ticker, `Stats: ${stats.map(([l, n]) => `${fmt(n)} ${l.toLowerCase()}`).join(", ")}`)]),
];
writeFileSync("README.md", md.join("\n"));
console.log(`projects=${projects.length}`, stats.map((s) => s.join("=")).join(" "));
