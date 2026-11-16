import type { Track } from "@/lib/api";
import { fileName, stem } from "@/lib/format";

/**
 * The folder tree of a session (spec #13): built from where each track is (or was, before
 * it was moved or trashed) inside the source folder. Folders are paths relative to the
 * source, "" being the source itself. Only folders holding tracks (here or below) appear.
 */
export interface FolderNode {
  /** Relative to the source folder; "" for the source itself. */
  path: string;
  name: string;
  depth: number;
  /** Tracks here and below (gone files not counted). */
  total: number;
  /** Of those, still to do. */
  pending: number;
  /** Tracks here and below matching the search (= total without a search). */
  matches: number;
  children: FolderNode[];
}

/** The folder of a track, relative to the source ("" = directly in it). */
export function folderOf(track: Track, root: string): string {
  const p = track.homePath;
  const prefix = root.endsWith("/") ? root : `${root}/`;
  if (!p.startsWith(prefix)) return "";
  const rel = p.slice(prefix.length);
  const i = rel.lastIndexOf("/");
  return i < 0 ? "" : rel.slice(0, i);
}

/** Whether a track in folder `rel` shows when `folder` is selected (null: all). */
export function inFolder(rel: string, folder: string | null): boolean {
  return !folder || rel === folder || rel.startsWith(`${folder}/`);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function buildTree(
  tracks: readonly Track[],
  root: string,
  matches?: (t: Track) => boolean,
): FolderNode {
  const top: FolderNode = {
    path: "",
    name: fileName(root),
    depth: 0,
    total: 0,
    pending: 0,
    matches: 0,
    children: [],
  };
  const byPath = new Map<string, FolderNode>([["", top]]);
  for (const t of tracks) {
    if (t.status === "missing") continue;
    const rel = folderOf(t, root);
    const chain = [top];
    if (rel) {
      let path = "";
      let parent = top;
      for (const name of rel.split("/")) {
        path = path ? `${path}/${name}` : name;
        let node = byPath.get(path);
        if (!node) {
          node = { path, name, depth: parent.depth + 1, total: 0, pending: 0, matches: 0, children: [] };
          byPath.set(path, node);
          parent.children.push(node);
        }
        chain.push(node);
        parent = node;
      }
    }
    const hit = !matches || matches(t);
    for (const n of chain) {
      n.total += 1;
      if (t.status === "pending") n.pending += 1;
      if (hit) n.matches += 1;
    }
  }
  const sort = (n: FolderNode) => {
    n.children.sort((a, b) => collator.compare(a.name, b.name));
    n.children.forEach(sort);
  };
  sort(top);
  return top;
}

/** Every folder in display order (pre-order). */
export function allFolders(node: FolderNode): FolderNode[] {
  return [node, ...node.children.flatMap(allFolders)];
}

/** The rows shown: children of a collapsed folder are left out. */
export function visibleFolders(node: FolderNode, collapsed: ReadonlySet<string>): FolderNode[] {
  if (collapsed.has(node.path)) return [node];
  return [node, ...node.children.flatMap((c) => visibleFolders(c, collapsed))];
}

/** "Label/2026" → ["Label", "Label/2026"]: the folders that must be open to show it. */
export function ancestors(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

// ── Search ──────────────────────────────────────────────────────────────────────────────

/** Lower case, accents off: "Ő" finds "o", "beyonce" finds "Beyoncé". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * A matcher for a search: every word must appear in the title, the artist or the file
 * name. Null for an empty search.
 */
export function trackMatcher(query: string): ((t: Track) => boolean) | null {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const cache = new WeakMap<Track, string>();
  return (t) => {
    let text = cache.get(t);
    if (text == null) {
      text = fold(`${t.title ?? ""} ${t.artist ?? ""} ${stem(t.path)}`);
      cache.set(t, text);
    }
    return words.every((w) => text.includes(w));
  };
}
