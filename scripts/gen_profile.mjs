// Generates README.md and banner.svg from profile.config.json plus live data:
// GitHub API, the yust.dev repo (projects + blog) and the yust.dev LinkedIn followers API.
import { readFileSync, writeFileSync } from "node:fs";
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
const clean = (s) =>
  s
    .replace(/\\(["'`])/g, "$1")
    .replace(/\p{Extended_Pictographic}|️/gu, "")
    .replace(/\|/g, "/")
    .trim();
const fmt = (n) => (n == null ? "-" : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US"));

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
  .map((c) => ({ title: field(c, "title"), desc: field(c, "description"), url: field(c, "siteLink") }))
  .filter((p) => p.title && p.url && p.desc)
  .slice(0, cfg.maxProjects);

const posts = blogSrc
  .split(/\n  \{\n/)
  .slice(1)
  .map((c) => ({ title: field(c, "title"), slug: field(c, "slug"), date: field(c, "date") }))
  .filter((p) => p.title && p.slug)
  .slice(0, cfg.maxPosts);

const recent = own.slice(0, cfg.maxRepos);

// ---- banner ----
const font = (f) => readFileSync(`assets/fonts/${f}`);
const el = (style, children) => ({ type: "div", props: { style: { display: "flex", ...style }, children } });
const W = 1200;
const tree = el(
  { width: "100%", height: "100%", background: "#0c0c0c", border: "1px solid #18181b", flexDirection: "column", padding: "64px 72px" },
  [
    el({ alignItems: "center" }, [
      el({ fontFamily: "Silkscreen", fontWeight: 700, fontSize: 84, color: "#ffffff", letterSpacing: 2 }, cfg.name),
      el({ width: 14, height: 76, background: "#f97316", marginLeft: 18 }, ""),
    ]),
    el({ fontFamily: "GeistMono", fontSize: 24, color: "#a1a1aa", marginTop: 26 }, cfg.tagline),
    el(
      { marginTop: 56, borderTop: "1px solid #27272a", paddingTop: 36, justifyContent: "space-between" },
      stats.map(([label, n]) =>
        el({ flexDirection: "column" }, [
          el({ fontFamily: "Silkscreen", fontWeight: 700, fontSize: 44, color: "#ffffff" }, fmt(n)),
          el({ fontFamily: "Silkscreen", fontWeight: 400, fontSize: 15, color: "#71717a", marginTop: 14, letterSpacing: 1 }, label),
        ]),
      ),
    ),
  ],
);
let svg = await satori(tree, {
  width: W,
  height: 420,
  fonts: [
    { name: "Silkscreen", data: font("silkscreen-700.ttf"), weight: 700 },
    { name: "Silkscreen", data: font("silkscreen-400.ttf"), weight: 400 },
    { name: "GeistMono", data: font("GeistMono-Regular.ttf"), weight: 400 },
  ],
});
// blinking cursor, like the site's "yousefdev |"
svg = svg.replace(
  /(<rect[^>]*fill="#f97316"[^>]*)\/>/,
  '$1><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1.1s" repeatCount="indefinite"/></rect>',
);
writeFileSync("banner.svg", svg);

// ---- readme ----
const lines = [`<img src="./banner.svg" alt="${cfg.name}" width="100%">`, "", cfg.bio, "", "&nbsp;", ""];
if (projects.length) {
  lines.push("**Projects**", "", ...projects.map((p) => `- [${clean(p.title)}](${p.url}): ${clean(p.desc)}`), "", "&nbsp;", "");
}
if (posts.length) {
  lines.push(
    "**Writing**",
    "",
    ...posts.map((p) => `- [${clean(p.title)}](${cfg.site.url}/blog/${p.slug}) · ${p.date}`),
    "",
    "&nbsp;",
    "",
  );
}
if (recent.length) {
  lines.push(
    "**Recently pushed**",
    "",
    ...recent.map((r) => `- [${r.name}](${r.html_url})${r.description ? `: ${clean(r.description)}` : ""}`),
    "",
    "&nbsp;",
    "",
  );
}
lines.push("**Find me**", "", cfg.links.map((l) => `[${l.label}](${l.url})`).join(" · "), "");
lines.push("", `<sub>Generated by <code>scripts/gen_profile.mjs</code> and refreshed daily · ${new Date().toISOString().slice(0, 10)}</sub>`, "");
writeFileSync("README.md", lines.join("\n"));
console.log(`projects=${projects.length} posts=${posts.length} repos=${recent.length}`, stats.map((s) => s.join("=")).join(" "));
