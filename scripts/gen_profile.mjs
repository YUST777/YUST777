// Generates README.md and the SVG cards in assets/cards from profile.config.json plus live stats
// (GitHub API and the yust.dev LinkedIn followers API).
// The README is images only: the stats banner, one projects showcase image, and a footer row (greeting + social icons).
// assets/showcase.png is built by scripts/make_showcase.py and is not regenerated here.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import satori from "satori";
import * as icons from "simple-icons";

const cfg = JSON.parse(readFileSync("profile.config.json", "utf8"));
const token = process.env.GITHUB_TOKEN;
async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "user-agent": "profile-gen", ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
const gh = (path) => getJson(`https://api.github.com${path}`, token ? { authorization: `Bearer ${token}` } : {});
// A failed source shows "-" instead of breaking the whole profile.
const safe = async (label, fn, fallback) => {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[skip] ${label}: ${e.message}`);
    return fallback;
  }
};
const fmt = (n) => (n == null ? "-" : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US"));
const host = (url) => url.replace(/^\w+:\/\/(www\.)?/, "").replace(/\/$/, "");

const [user, repos, commits, linkedin] = await Promise.all([
  safe("user", () => gh(`/users/${cfg.user}`), {}),
  safe("repos", () => gh(`/users/${cfg.user}/repos?per_page=100`), []),
  safe("commits", async () => (await gh(`/search/commits?q=author:${cfg.user}&per_page=1`)).total_count, null),
  safe("linkedin", async () => (await getJson(cfg.site.followersApi)).followers, null),
]);
// Contribution calendar needs a token (GraphQL); without one the card is skipped.
const calendar = await safe(
  "contributions",
  async () => {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { "user-agent": "profile-gen", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: `{user(login:"${cfg.user}"){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionLevel}}}}}}`,
      }),
    });
    const json = await res.json();
    if (!json.data) throw new Error(JSON.stringify(json.errors ?? json));
    return json.data.user.contributionsCollection.contributionCalendar;
  },
  null,
);
const stats = [
  ["COMMITS", commits],
  ["STARS", repos.reduce((n, r) => n + (r.stargazers_count || 0), 0)],
  ["REPOS", user.public_repos],
  ["GITHUB", user.followers],
  ["LINKEDIN", linkedin],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// ---- theme (matches yust.dev) ----
const C = { card: "#0c0c0c", line: "#252528", white: "#ffffff", text: "#a1a1aa", dim: "#71717a", faint: "#3f3f46", accent: "#60a5fa" };
const OUT = "assets/cards";
const font = (f) => readFileSync(`assets/fonts/${f}`);
const fonts = [
  { name: "Silkscreen", data: font("silkscreen-700.ttf"), weight: 700 },
  { name: "Silkscreen", data: font("silkscreen-400.ttf"), weight: 400 },
  { name: "GeistMono", data: font("GeistMono-Regular.ttf"), weight: 400 },
  { name: "Geist", data: font("Geist-Regular.ttf"), weight: 400 },
  { name: "Geist", data: font("Geist-SemiBold.ttf"), weight: 600 },
];
const el = (style, children = "") => ({ type: "div", props: { style: { display: "flex", ...style }, children } });
const card = (style, children) =>
  el({ width: "100%", height: "100%", background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, ...style }, children);
const blink = (svg) =>
  svg.replace(
    new RegExp(`(<rect[^>]*fill="${C.accent}"[^>]*)\\/>`),
    '$1><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1.1s" repeatCount="indefinite"/></rect>',
  );

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// The content hash goes in the filename: raw.githubusercontent.com caches each path for minutes,
// so a changed card needs a new path to show up right away.
async function draw(name, w, h, tree, post = (s) => s) {
  const svg = post(await satori(tree, { width: w, height: h, fonts }));
  const path = `${OUT}/${name}.${createHash("sha1").update(svg).digest("hex").slice(0, 8)}.svg`;
  writeFileSync(path, svg);
  return path;
}

// Header row = one wide card + square icon cards, all the same height so they line up in one row.
const ROW_H = 120;
const header = await draw(
  "header",
  1245,
  ROW_H,
  card({ alignItems: "center", padding: "0 44px" }, [
    el({ fontFamily: "Silkscreen", fontWeight: 700, fontSize: 40, color: C.white, letterSpacing: 2 }, cfg.name),
    el({ width: 8, height: 40, background: C.accent, marginLeft: 10 }),
    el({ width: 1, height: 44, background: C.line, margin: "0 32px" }),
    el({ fontFamily: "GeistMono", fontSize: 30, color: C.white }, cfg.greeting),
  ]),
  blink,
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
      ROW_H,
      card({ alignItems: "center", justifyContent: "center" }, [
        { type: "img", props: { src: iconSrc(s.icon, s.icon === "linkedin" ? C.accent : C.white), width: 52, height: 52 } },
      ]),
    ),
  );
}

const pixel = (size, color, text, extra = {}) =>
  el({ fontFamily: "Silkscreen", fontWeight: 700, fontSize: size, color, ...extra }, text);
const mono = (size, color, text, extra = {}) => el({ fontFamily: "GeistMono", fontSize: size, color, ...extra }, text);
const hero = await draw(
  "hero",
  1200,
  460,
  card({ flexDirection: "column", justifyContent: "space-between", padding: "44px 64px 40px" }, [
    el({ justifyContent: "space-between", alignItems: "center" }, [
      mono(20, C.dim, `~/${host(cfg.site.url)}`),
      el({ alignItems: "center" }, [
        el({ width: 10, height: 10, borderRadius: 999, background: C.accent, marginRight: 12 }),
        mono(20, C.dim, cfg.location),
      ]),
    ]),
    el({ flexDirection: "column" }, [
      el({ alignItems: "center" }, [
        pixel(84, C.white, cfg.name, { letterSpacing: 2 }),
        el({ width: 14, height: 76, background: C.accent, marginLeft: 18 }),
      ]),
      el({ marginTop: 18, alignItems: "center" }, [
        mono(24, C.white, cfg.fullName),
        mono(24, C.faint, "/", { margin: "0 16px" }),
        mono(24, C.text, cfg.tagline),
      ]),
    ]),
    el(
      { borderTop: `1px solid ${C.line}`, paddingTop: 30, justifyContent: "space-between" },
      stats.map(([label, n]) =>
        el({ flexDirection: "column" }, [
          pixel(40, C.white, fmt(n)),
          pixel(14, C.dim, label, { fontWeight: 400, marginTop: 12, letterSpacing: 1 }),
        ]),
      ),
    ),
  ]),
  blink,
);

// Stack strip: monochrome logos only.
const stack = await draw(
  "stack",
  1200,
  120,
  card({ alignItems: "center", justifyContent: "space-around", padding: "0 40px" }, [
    ...cfg.stack.map((k) => ({
      type: "img",
      props: {
        src: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${C.text}" d="${icons[k].path}"/></svg>`).toString("base64")}`,
        width: 44,
        height: 44,
      },
    })),
  ]),
);

// Hackathon chips: one image per win so each links to its blog post. Widths must add to < 100% in one row.
// Trophy is the PixelTrophy SVG from yust.dev (src/routes/_main/hacks.tsx), colored by place.
const MEDAL = { 1: ["#FFD700", "1st"], 2: ["#C0C0C0", "2nd"], 3: ["#CD7F32", "3rd"] };
const trophy = (color) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 8" shape-rendering="crispEdges"><path fill="${color}" d="M1 0h5v1H1z M0 1h7v2H0z M1 3h5v1H1z M2 4h3v1H2z M3 5h1v1H3z M2 6h3v1H2z M1 7h5v1H1z"/></svg>`,
  ).toString("base64")}`;
// Trophy pixels (7x8 grid, same shape as PixelTrophy), built bottom-up then cleared, on a loop.
const TROPHY_ROWS = [[1, 5], [0, 6], [0, 6], [1, 5], [2, 4], [3, 3], [2, 4], [1, 5]];
const animatedTrophy = (svg) =>
  svg.replace(/<image[^>]*?x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*href="data:image\/svg\+xml;base64,([^"]+)"[^>]*\/>/g, (tag, x, y, w, h, b64) => {
    const color = Buffer.from(b64, "base64").toString().match(/fill="(#[0-9A-Fa-f]{6})"/)?.[1];
    if (!color) return tag;
    let i = 0;
    const px = [];
    for (let r = 7; r >= 0; r--)
      for (let c = TROPHY_ROWS[r][0]; c <= TROPHY_ROWS[r][1]; c++)
        px.push(`<rect class="px" x="${c}" y="${r}" width="1" height="1" fill="${color}" style="animation-delay:${(i++ * 0.05).toFixed(2)}s"/>`);
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 7 8" shape-rendering="crispEdges">${px.join("")}</svg>`;
  }).replace(/(<svg[^>]*>)/, `$1<style>.px{opacity:0;animation:build 6s ease-out infinite}@keyframes build{0%{opacity:0}4%{opacity:1}80%{opacity:1}90%,100%{opacity:0}}</style>`);

// All wins in one card (separate chips looked like mismatched widgets side by side).
const hackathons = await draw(
  "hackathons",
  1200,
  150,
  card({ alignItems: "center", justifyContent: "space-around", padding: "0 32px" }, [
    ...cfg.hackathons.map((hk) => {
      const [color, label] = MEDAL[hk.place];
      return el({ alignItems: "center" }, [
        { type: "img", props: { src: trophy(color), width: 42, height: 48, style: { marginRight: 22, flexShrink: 0 } } },
        el({ flexDirection: "column" }, [
          el({ fontFamily: "Geist", fontWeight: 600, fontSize: 25, color: C.white }, hk.event),
          el({ fontFamily: "Geist", fontSize: 17, color: C.text, marginTop: 6 }, [
            el({ color, fontWeight: 600, marginRight: 8 }, `${label} place`),
            `· ${hk.project}`,
          ]),
        ]),
      ]);
    }),
  ]),
  animatedTrophy,
);

// Contribution heatmap in the site's blue instead of GitHub green.
const LEVEL = { NONE: "#18181b", FIRST_QUARTILE: "#1e3a8a", SECOND_QUARTILE: "#2563eb", THIRD_QUARTILE: "#3b82f6", FOURTH_QUARTILE: "#93c5fd" };
let contrib = null;
if (calendar) {
  const weeks = calendar.weeks.slice(-53);
  const CELL = 17;
  const PADX = 52;
  const TOP = 100; // padding 40 + header 40 + gap 20
  const STEP_X = (1200 - 2 * PADX - CELL) / (weeks.length - 1);
  const STEP_Y = 20.6;
  const GRID_H = Math.ceil(6 * STEP_Y + CELL);
  const cells = [];
  weeks.forEach((w, wi) => {
    const offset = wi === 0 ? 7 - w.contributionDays.length : 0; // first week may start mid-week
    w.contributionDays.forEach((d, di) => {
      const x = (PADX + wi * STEP_X).toFixed(1);
      const y = (TOP + (di + offset) * STEP_Y).toFixed(1);
      cells.push(`<rect class="c" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="4" fill="${LEVEL[d.contributionLevel]}" style="animation-delay:${(wi * 0.03 + di * 0.02).toFixed(2)}s"/>`);
    });
  });
  // cells sweep in left to right on load; the busiest ones keep a slow glow
  const style = `<style>.c{opacity:0;transform-box:fill-box;transform-origin:center;animation:pop .5s cubic-bezier(.3,1.6,.5,1) forwards}@keyframes pop{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}rect[fill="${LEVEL.FOURTH_QUARTILE}"]{animation:pop .5s cubic-bezier(.3,1.6,.5,1) forwards,glow 2.4s ease-in-out 2s infinite}@keyframes glow{50%{opacity:.45}}</style>`;
  contrib = await draw(
    "contributions",
    1200,
    TOP + GRID_H + 40,
    card({ flexDirection: "column", padding: `40px ${PADX}px` }, [
      el({ height: 40, justifyContent: "space-between", alignItems: "center" }, [
        el({ alignItems: "baseline" }, [
          pixel(30, C.white, calendar.totalContributions.toLocaleString("en-US")),
          mono(18, C.dim, "contributions in the last year", { marginLeft: 16 }),
        ]),
        el({ alignItems: "center" }, [
          mono(15, C.dim, "less", { marginRight: 8 }),
          ...Object.values(LEVEL).map((c) => el({ width: 13, height: 13, borderRadius: 3, background: c, marginRight: 4 })),
          mono(15, C.dim, "more", { marginLeft: 4 }),
        ]),
      ]),
    ]),
    (svg) => svg.replace(/<\/svg>$/, `${style}${cells.join("")}</svg>`),
  );
}

// ---- readme ----
const img = (src, alt, attrs = 'width="100%"') => `<img src="${src}" ${attrs} alt="${esc(alt)}" />`;
const link = (href, inner) => `<a href="${href}">${inner}</a>`;
const block = (lines) => ['<p align="center">', ...lines, "</p>", ""];

const md = [
  "<!-- Generated by scripts/gen_profile.mjs. Edit profile.config.json instead. -->",
  "",
  ...block([img(hero, `${cfg.fullName}, ${cfg.tagline}. ${stats.map(([l, n]) => `${fmt(n)} ${l.toLowerCase()}`).join(", ")}`)]),
  ...block([img(stack, `Stack: ${cfg.stack.map((k) => icons[k].title).join(", ")}`)]),
  ...block([link(cfg.projects.url, img(cfg.projects.image, cfg.projects.alt))]),
  ...block([
    link(
      `${cfg.site.url}/hacks`,
      img(hackathons, `Hackathons: ${cfg.hackathons.map((hk) => `${MEDAL[hk.place][1]} place at ${hk.event} with ${hk.project}`).join("; ")}`),
    ),
  ]),
  ...(contrib ? block([img(contrib, `${calendar.totalContributions} contributions in the last year`)]) : []),
  // no whitespace between the header images, or the row wraps
  ...block([
    link(cfg.site.url, img(header, `${cfg.greeting}. Find me on LinkedIn and X.`, 'width="83%"')) +
      cfg.social.map((s, i) => link(s.url, img(socialCards[i], s.label, 'width="8%"'))).join(""),
  ]),
];
writeFileSync("README.md", md.join("\n"));
