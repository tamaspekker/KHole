#!/usr/bin/env node
// Generates THIRD_PARTY_NOTICES.md: every third-party component that ships inside KHole.app,
// with its license text(s).
//
//   - Rust crates linked into the app binary (normal dependencies of `khole`, aarch64 macOS),
//   - JavaScript packages that end up in the frontend bundle (found by a real Vite build),
//   - the analyzer sidecar's statically linked C/C++ libraries (Essentia, libsamplerate, Eigen).
//
// Usage: node scripts/third-party-notices.mjs   (run after `npm ci`; needs cargo and Homebrew)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LICENSE_FILE = /^(licen[sc]e|copying|notice|unlicense)([-._].*)?$/i;

/** License, copying and notice files at the top of a package directory. */
function licenseTexts(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && LICENSE_FILE.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ file: e.name, text: readFileSync(join(dir, e.name), "utf8").trim() }));
}

// --- Rust ---------------------------------------------------------------------------------
function rustPackages() {
  const meta = JSON.parse(
    execFileSync(
      "cargo",
      ["metadata", "--format-version", "1", "--filter-platform", "aarch64-apple-darwin"],
      { cwd: join(ROOT, "src-tauri"), maxBuffer: 256 << 20 },
    ),
  );
  const byId = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const rootId = meta.resolve.root;
  // Walk normal (non-dev, non-build) dependencies only: what is linked into the binary.
  const seen = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const dep of nodes.get(stack.pop()).deps) {
      const normal = dep.dep_kinds.some((k) => k.kind === null);
      if (normal && !seen.has(dep.pkg)) {
        seen.add(dep.pkg);
        stack.push(dep.pkg);
      }
    }
  }
  seen.delete(rootId);
  return [...seen].map((id) => {
    const p = byId.get(id);
    return {
      name: p.name,
      version: p.version,
      license: p.license ?? (p.license_file ? `see ${p.license_file}` : "unknown"),
      url: p.repository ?? p.homepage ?? `https://crates.io/crates/${p.name}`,
      texts: licenseTexts(dirname(p.manifest_path)),
    };
  });
}

// --- JavaScript ---------------------------------------------------------------------------
/** The packages whose modules end up in the production bundle. */
async function jsPackages() {
  const { build } = await import("vite");
  const dirs = new Set();
  await build({
    root: ROOT,
    configFile: join(ROOT, "vite.config.ts"),
    logLevel: "silent",
    build: { write: false },
    plugins: [
      {
        name: "collect-packages",
        generateBundle(_, bundle) {
          for (const chunk of Object.values(bundle)) {
            for (const id of Object.keys(chunk.modules ?? {})) {
              const path = id.replace(/^\0/, "").split("?")[0];
              const at = path.lastIndexOf(`${sep}node_modules${sep}`);
              if (at < 0) continue;
              const rest = path.slice(at + 14).split(sep);
              const name = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
              dirs.add(join(path.slice(0, at + 14), name));
            }
          }
        },
      },
    ],
  });
  return [...dirs].map((dir) => {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    return {
      name: pkg.name,
      version: pkg.version,
      license: typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "unknown"),
      url: (repo ?? pkg.homepage ?? `https://www.npmjs.com/package/${pkg.name}`)
        .replace(/^git\+/, "")
        .replace(/^git@github\.com:/, "https://github.com/")
        .replace(/^github:/, "https://github.com/")
        .replace(/^(?![a-z]+:)([\w.-]+\/[\w.-]+)$/, "https://github.com/$1")
        .replace(/\.git$/, ""),
      texts: licenseTexts(dir),
    };
  });
}

// --- Sidecar (khole-analyze) --------------------------------------------------------------
function sidecarPackages() {
  const brew = (f) => execFileSync("brew", ["--prefix", f], { encoding: "utf8" }).trim();
  const version = (f) =>
    execFileSync("brew", ["list", "--versions", f], { encoding: "utf8" }).trim().split(" ")[1];
  const essentia = join(ROOT, "vendor/essentia");
  return [
    {
      name: "Essentia",
      version: readFileSync(join(essentia, "VERSION"), "utf8").trim(),
      license: "AGPL-3.0",
      url: "https://essentia.upf.edu/",
      note:
        "Statically linked into the khole-analyze sidecar (lightweight build: no models, " +
        "no TensorFlow, FFmpeg, TagLib or Gaia). Source: the vendor/essentia submodule of " +
        "the KHole repository.",
      texts: licenseTexts(essentia).filter((t) => t.file === "COPYING.txt"),
    },
    {
      name: "libsamplerate",
      version: version("libsamplerate"),
      license: "BSD-2-Clause",
      url: "https://github.com/libsndfile/libsamplerate",
      note: "Statically linked into the khole-analyze sidecar.",
      texts: licenseTexts(brew("libsamplerate")),
    },
    {
      name: "Eigen",
      version: version("eigen"),
      license: "MPL-2.0",
      url: "https://eigen.tuxfamily.org/",
      note: "Header-only; compiled into the khole-analyze sidecar via Essentia.",
      texts: [
        {
          file: "COPYING.MPL2",
          text: "Eigen is licensed under the Mozilla Public License 2.0: https://mozilla.org/MPL/2.0/\nSource code: https://gitlab.com/libeigen/eigen",
        },
      ],
    },
  ];
}

// --- Output -------------------------------------------------------------------------------
// Identical license texts (the Apache-2.0 text, most MIT texts of one author…) are written
// once, in an appendix; packages refer to them by number.
const texts = new Map(); // normalized text -> { n, text }
function textRef(t) {
  const key = t.text.replace(/\s+/g, " ");
  if (!texts.has(key)) texts.set(key, { n: texts.size + 1, text: t.text });
  return `[${t.file}](#license-text-${texts.get(key).n})`;
}

const spdx = (license) =>
  [...new Set(license.match(/[A-Za-z0-9.+-]+/g) ?? [])]
    .filter((id) => !["OR", "AND", "WITH", "see", "License"].includes(id))
    .map((id) => `[${id}](https://spdx.org/licenses/${id}.html)`)
    .join(", ");

function section(title, packages) {
  const sorted = [...packages].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
  let out = `## ${title}\n\n| Component | Version | License | Text |\n|---|---|---|---|\n`;
  for (const p of sorted) {
    const refs = p.texts.length ? p.texts.map(textRef).join(", ") : `standard text: ${spdx(p.license)}`;
    out += `| [${p.name}](${p.url}) | ${p.version} | ${p.license} | ${refs} |\n`;
  }
  const notes = sorted.filter((p) => p.note);
  if (notes.length) out += "\n" + notes.map((p) => `- **${p.name}:** ${p.note}`).join("\n") + "\n";
  return out + "\n";
}

function appendix() {
  let out = "## License texts\n\n";
  for (const { n, text } of texts.values())
    out += `### License text ${n}\n\n\`\`\`text\n${text.replaceAll("\`\`\`", "ʼʼʼ")}\n\`\`\`\n\n`;
  return out;
}

const header = `# Third-party notices

KHole is free software, licensed under the GNU General Public License v3.0 or later (see
LICENSE). Its source code, including the exact versions of the components below, is
available at https://github.com/tomi2400/KHole – each release is tagged.

KHole.app contains the following third-party software. This file is generated by
\`scripts/third-party-notices.mjs\`; do not edit it by hand.

`;

const [rust, js] = [rustPackages(), await jsPackages()];
const md =
  header +
  section("Analyzer sidecar (khole-analyze)", sidecarPackages()) +
  section("Rust crates (app binary)", rust) +
  section("JavaScript packages (user interface)", js) +
  appendix();
writeFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), md);
console.log(
  `THIRD_PARTY_NOTICES.md: ${rust.length} crates, ${js.length} JS packages, 3 sidecar libraries, ${texts.size} distinct license texts`,
);
