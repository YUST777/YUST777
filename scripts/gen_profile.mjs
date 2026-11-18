// Generates README.md and the SVG cards in assets/cards from profile.config.json plus live data:
// GitHub API, the yust.dev repo (projects + blog) and the yust.dev LinkedIn followers API.
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

const [user, repos, commits, linkedin, projectsSrc, blogSrc] = await Promise.all([
  safe("user", () => gh(`/users/${cfg.user}`), {}),
  safe("repos", () => gh(`/users/${cfg.user}/repos?per_page=100&sort=pushed`), []),
  safe("commits", async () => (await gh(`/search/commits?q=author:${cfg.user}&per_page=1`)).total_count, null),
  safe("linkedin", async () => (await getJson(cfg.site.followersApi)).followers, null),
  safe("projects", () => raw("src/components/projects/ProjectsData.ts"), ""),
  safe("blog", () => raw("src/data/blog.ts"), ""),
]);

const own = repos.filter((r) => !r.fork && r.name.toLowerCase() !== cfg.user.toLowerCase());
const stars = repos.reduce((n, r) => n + (r.stargazers_count || 0), 0);
const stats = [
  ["COMMITS", commits],
  ["STARS", stars],
  ["REPOS", user.public_repos],
  ["GITHUB", user.followers],
  ["LINKEDIN", linkedin],
];

const projects = projectsSrc
  .split(/\n  \{\n/)
  .slice(1)
  .map((c) => ({
    title: clean(field(c, "title")),
    desc: clean(field(c, "description")),
    tag: clean(field(c, "tag")),
    url: field(c, "siteLink"),
    tech: list(c, "technologies").map(clean),
  }))
  .filter((p) => p.title && p.url && p.desc)
  .slice(0, cfg.maxProjects);

const posts = blogSrc
  .split(/\n  \{\n/)
  .slice(1)
  .map((c) => ({ title: clean(field(c, "title")), slug: field(c, "slug"), date: field(c, "date") }))
  .filter((p) => p.title && p.slug)
  .slice(0, cfg.maxPosts);

const recent = own.slice(0, cfg.maxRepos);

// ---- theme (matches yust.dev) ----
const C = {
  bg: "#0c0c0c",
  card: "#141414",
  line: "#232326",
  white: "#ffffff",
  text: "#a1a1aa",
  dim: "#71717a",
  faint: "#3f3f46",
  accent: "#f97316",
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
const pill = (text, color = C.text) =>
  el(
    { border: `1px solid ${C.faint}`, borderRadius: 999, padding: "6px 14px", marginRight: 10 },
    mono(15, color, text.toUpperCase(), { letterSpacing: 1.5 }),
  );
const arrow = (color = C.dim) => mono(30, color, "↗");
const blink = (svg) =>
  svg.replace(
    /(<rect[^>]*fill="#f97316"[^>]*)\/>/,
    '$1><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1.1s" repeatCount="indefinite"/></rect>',
  );

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
async function draw(name, h, tree, { w = W, post = (s) => s } = {}) {
  writeFileSync(`${OUT}/${name}.svg`, post(await satori(tree, { width: w, height: h, fonts })));
  return `${OUT}/${name}.svg`;
}

// Rough word wrap for GeistMono (0.6em advance) so text cards get the right height.
const wrapLines = (text, size, width) => {
  const max = Math.floor(width / (size * 0.6));
  let lines = 1;
  let len = 0;
  for (const w of text.split(/\s+/)) {
    if (len && len + 1 + w.length > max) (lines++, (len = w.length));
    else len += (len ? 1 : 0) + w.length;
  }
  return lines;
};

// ---- cards ----
const hero = await draw(
  "hero",
  460,
  card({ background: C.bg, flexDirection: "column", justifyContent: "space-between", padding: `44px ${PAD + 8}px 40px` }, [
    el({ justifyContent: "space-between", alignItems: "center" }, [
      mono(20, C.dim, `~/${host(cfg.site.url)}`),
      el({ alignItems: "center" }, [
        el({ width: 10, height: 10, borderRadius: 999, background: C.accent, marginRight: 12 }),
        mono(20, C.dim, cfg.location ?? ""),
      ]),
    ]),
    el({ flexDirection: "column" }, [
      el({ alignItems: "center" }, [
        pixel(84, C.white, cfg.name, { letterSpacing: 2 }),
        el({ width: 14, height: 76, background: C.accent, marginLeft: 18 }),
      ]),
      mono(24, C.text, cfg.tagline, { marginTop: 18 }),
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
  { post: blink },
);

const bioSize = 25;
const bioLines = wrapLines(cfg.bio, bioSize, W - 2 * PAD - 8);
const about = await draw(
  "about",
  2 * 48 + bioLines * bioSize * 1.6 + 4,
  card({ padding: `46px ${PAD}px`, alignItems: "flex-start" }, [
    el({ width: 4, alignSelf: "stretch", background: C.accent, marginRight: 28, borderRadius: 2 }),
    mono(bioSize, C.text, cfg.bio, { flex: 1, lineHeight: 1.6 }),
  ]),
);

const header = (name, label, count) =>
  draw(
    name,
    96,
    el({ width: "100%", height: "100%", alignItems: "center", padding: `0 ${PAD}px` }, [
      el({ width: 12, height: 12, background: C.accent, marginRight: 18 }),
      pixel(26, C.white, label, { letterSpacing: 2 }),
      el({ flex: 1, height: 1, background: C.line, margin: "0 24px" }),
      pixel(18, C.faint, String(count).padStart(2, "0")),
    ]),
  );

const projectCards = [];
for (const [i, p] of projects.entries()) {
  projectCards.push(
    await draw(
      `project-${i}`,
      210,
      card({ padding: `34px ${PAD}px`, flexDirection: "column", justifyContent: "space-between" }, [
        el({ alignItems: "center", justifyContent: "space-between" }, [
          el({ alignItems: "center" }, [
            pixel(18, C.faint, String(i + 1).padStart(2, "0"), { marginRight: 22 }),
            pixel(36, C.white, p.title),
            p.tag ? mono(16, C.accent, p.tag.toUpperCase(), { marginLeft: 22, letterSpacing: 1.5 }) : null,
          ]),
          el({ alignItems: "center" }, [mono(18, C.dim, host(p.url), { marginRight: 14 }), arrow()]),
        ]),
        mono(22, C.text, p.desc, { ...oneLine, marginLeft: 50 }),
        el({ marginLeft: 50 }, p.tech.slice(0, 5).map((t) => pill(t))),
      ]),
    ),
  );
}

const postCards = [];
for (const [i, p] of posts.entries()) {
  postCards.push(
    await draw(
      `post-${i}`,
      92,
      card({ alignItems: "center", padding: `0 ${PAD}px` }, [
        mono(18, C.dim, (p.date ?? "").toUpperCase(), { width: 170, letterSpacing: 1 }),
        mono(23, C.white, p.title, { ...oneLine, flex: 1, marginRight: 24 }),
        arrow(),
      ]),
    ),
  );
}

const repoCards = [];
for (const [i, r] of recent.entries()) {
  repoCards.push(
    await draw(
      `repo-${i}`,
      132,
      card({ padding: `28px ${PAD}px`, flexDirection: "column", justifyContent: "space-between" }, [
        el({ alignItems: "center", justifyContent: "space-between" }, [
          pixel(26, C.white, r.name),
          el({ alignItems: "center" }, [
            r.language ? el({ width: 10, height: 10, borderRadius: 999, background: C.accent, marginRight: 10 }) : null,
            mono(17, C.dim, [r.language, `${r.stargazers_count} stars`].filter(Boolean).join("   ")),
          ]),
        ]),
        mono(20, C.text, clean(r.description ?? "-"), oneLine),
      ]),
    ),
  );
}

const contactCards = [];
for (const [i, l] of cfg.links.entries()) {
  contactCards.push(
    await draw(
      `contact-${i}`,
      64,
      el(
        {
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 999,
        },
        [pixel(17, C.white, l.label.toUpperCase(), { letterSpacing: 2, marginRight: 10 }), mono(20, C.accent, "↗")],
      ),
      { w: 210 },
    ),
  );
}

// Ticker: two identical halves side by side, slid left by one half forever = seamless loop.
const tickerItems = [...stats.map(([l, n]) => `${fmt(n)} ${l}`), ...new Set(projects.flatMap((p) => p.tech))].slice(0, 14);
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
const img = (src, alt, attrs = 'width="100%"') => `<img src="${src}" ${attrs} alt="${esc(alt)}" />`;
const link = (href, inner) => `<a href="${href}">${inner}</a>`;
const block = (lines) => ["<p align=\"center\">", ...lines, "</p>", ""];

const md = [
  "<!-- Generated by scripts/gen_profile.mjs. Edit profile.config.json instead. -->",
  "",
  ...block([img(hero, `${cfg.name}: ${cfg.tagline}. ${stats.map(([l, n]) => `${fmt(n)} ${l.toLowerCase()}`).join(", ")}`)]),
  ...block([img(about, cfg.bio)]),
];
if (projectCards.length) {
  md.push(
    ...block([
      img(await header("h-projects", "PROJECTS", projectCards.length), "Projects") + "<br>",
      ...projectCards.map((src, i) => link(projects[i].url, img(src, `${projects[i].title}: ${projects[i].desc}`)) + "<br>"),
    ]),
  );
}
if (postCards.length) {
  md.push(
    ...block([
      img(await header("h-writing", "WRITING", postCards.length), "Writing") + "<br>",
      ...postCards.map((src, i) => link(`${cfg.site.url}/blog/${posts[i].slug}`, img(src, `${posts[i].title}, ${posts[i].date}`)) + "<br>"),
    ]),
  );
}
if (repoCards.length) {
  md.push(
    ...block([
      img(await header("h-recent", "RECENTLY PUSHED", repoCards.length), "Recently pushed") + "<br>",
      ...repoCards.map((src, i) => link(recent[i].html_url, img(src, `${recent[i].name}: ${recent[i].description ?? ""}`)) + "<br>"),
    ]),
  );
}
md.push(
  ...block([
    img(await header("h-contact", "FIND ME", contactCards.length), "Find me") + "<br>",
    ...contactCards.map((src, i) => link(cfg.links[i].url, img(src, cfg.links[i].label, 'height="40"'))),
  ]),
  ...block([img(ticker, "Stats and stack ticker")]),
);
writeFileSync("README.md", md.join("\n"));
console.log(`projects=${projects.length} posts=${posts.length} repos=${recent.length}`, stats.map((s) => s.join("=")).join(" "));
