// Generates README.md and the SVG cards in assets/cards from profile.config.json plus live stats
// (GitHub API and the yust.dev LinkedIn followers API).
// The README is images only: a header row (greeting + social icons), the stats banner, and one projects showcase image.
// assets/showcase.png is built by scripts/make_showcase.py and is not regenerated here.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import satori from "satori";

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
async function draw(name, w, h, tree, post = (s) => s) {
  writeFileSync(`${OUT}/${name}.svg`, post(await satori(tree, { width: w, height: h, fonts })));
  return `${OUT}/${name}.svg`;
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

// ---- readme ----
const img = (src, alt, attrs = 'width="100%"') => `<img src="${src}" ${attrs} alt="${esc(alt)}" />`;
const link = (href, inner) => `<a href="${href}">${inner}</a>`;
const block = (lines) => ['<p align="center">', ...lines, "</p>", ""];

const md = [
  "<!-- Generated by scripts/gen_profile.mjs. Edit profile.config.json instead. -->",
  "",
  // no whitespace between the header images, or the row wraps
  ...block([
    link(cfg.site.url, img(header, `${cfg.greeting}. I'm ${cfg.fullName} (${cfg.name}), ${cfg.tagline}.`, 'width="83%"')) +
      cfg.social.map((s, i) => link(s.url, img(socialCards[i], s.label, 'width="8%"'))).join(""),
  ]),
  ...block([img(hero, `${cfg.fullName}, ${cfg.tagline}. ${stats.map(([l, n]) => `${fmt(n)} ${l.toLowerCase()}`).join(", ")}`)]),
  ...block([link(cfg.projects.url, img(cfg.projects.image, cfg.projects.alt))]),
];
writeFileSync("README.md", md.join("\n"));
