# KHole

A fast, keyboard-driven triage tool for DJs on macOS: open a folder of new promos, listen to
each track for a few seconds, and send it to a destination folder, keep it, or trash it with
a single key.

**Status: 0.1.0, first public release.** It works well for its author's daily promo triage;
expect rough edges. [Feedback and bug reports](https://github.com/tamaspekker/KHole/issues) are
very welcome.

## Features

- **One key per decision:** `1`–`0` send the track to a destination folder, `Enter` keeps it,
  `Backspace` moves it to the Trash, and the next track starts playing.
- **Waveform preview** with a configurable start point (e.g. jump straight to 25%), ±15 s /
  ±60 s seeking and a tempo fader with keylock.
- **BPM and key** from the file tags, or from a bundled analyzer
  ([Essentia](https://essentia.upf.edu/)) running in the background when tags are missing.
- **Folder tree, search and filters** for promo folders with sub-folders (per label, per
  week…).
- **Destination bar:** drag tracks onto destination tiles, or press `M` to find any folder.
- **Rename and retag in place:** Title, Artist and the file name, editable in the list.
- **Sessions:** close the app and continue where you left off; a summary at the end.
- **Every shortcut can be remapped** (press `?`).

Formats: MP3, WAV, AIFF, FLAC, AAC / M4A.

## Nothing is ever lost

- Deleting means moving to the **macOS Trash**, so you can put it back from Finder.
- **No overwriting:** a name conflict gets a `name (2).ext` suffix.
- **Every action can be undone** with `⌘Z`, many steps deep, or all at once with
  *Undo session*.
- **Only the folders you pick are touched**: the source folder and your destinations.

## Install

Requirements: **macOS 13 or later on Apple Silicon** (M1 or newer). Intel Macs are not
supported yet.

1. Download `KHole-<version>-arm64.dmg` from the
   [latest release](https://github.com/tamaspekker/KHole/releases/latest).
2. Open it and drag **KHole** into **Applications**.
3. **First launch:** KHole is free and open source, but not signed with a paid Apple
   Developer ID, so macOS will say *“Apple could not verify ‘KHole’ is free of malware”*.
   - Click **Done** (not *Move to Trash*).
   - Open **System Settings › Privacy & Security**, scroll down to the message about KHole,
     and click **Open Anyway**. Confirm with your password or Touch ID.
   - From then on, KHole opens normally. You only need to do this again after an update.

   If you prefer the Terminal: `xattr -dr com.apple.quarantine /Applications/KHole.app`

You can check the download against `SHA256SUMS.txt` in the release:
`shasum -a 256 ~/Downloads/KHole-*.dmg`

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Back / forward 15 s (`⇧` for 60 s) |
| `↑` / `↓` | Previous / next track (no decision) |
| `1`–`0` | Send to that destination, next track |
| `M` | Move to… (find any destination) |
| `Enter` | Keep where it is, next track |
| `Backspace` | Move to Trash, next track |
| `⌘Z` | Undo |
| `,` / `.` | Tempo −0.5% / +0.5% |
| `T` / `K` | Tempo back to 0% / keylock on or off |
| `⇧↑` / `⇧↓` | Previous / next folder |
| `⌘F` / `S` | Search tracks / show or hide the sidebar |
| `⌘R` | Reveal in Finder |
| `?` | All shortcuts (click one to remap it) |

## Building from source

Requirements: macOS on Apple Silicon, Xcode 26 (for the Liquid Glass app icon; older Xcode
versions fall back to the classic icon), Rust (stable), Node 24, Homebrew.

```sh
git clone --recurse-submodules https://github.com/tamaspekker/KHole.git
cd KHole
# (existing clone: git submodule update --init vendor/essentia)

brew install eigen libsamplerate pkgconf
sidecar/khole-analyze/build.sh   # builds static Essentia once, then the sidecar

npm install
npm run tauri dev                # or: npm run tauri build
```

The Essentia source lives in the `vendor/essentia` git submodule. Its own nested
submodules (test audio and models) are not needed.

### Tech stack

- [Tauri 2](https://tauri.app/) with a Rust backend (file operations, SQLite, waveform peaks)
- React + TypeScript + [shadcn/ui](https://ui.shadcn.com/) + Tailwind CSS
- `khole-analyze`: a small C++ sidecar on top of Essentia for BPM/key detection
  (`sidecar/khole-analyze/`). It reads mono f32le PCM on stdin and prints JSON.

### Releasing

1. Bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
   `package.json`, and write `docs/release-notes/v<version>.md`.
2. `node scripts/third-party-notices.mjs` if dependencies changed; commit.
3. `git tag v<version> && git push origin v<version>`. The *Release* workflow builds the
   `.dmg` and creates a **draft** GitHub release; review and publish it.

## License

KHole is free software under the [GNU General Public License v3.0 or later](LICENSE).

The analyzer links [Essentia](https://github.com/MTG/essentia), which is licensed under the
AGPL-3.0. Essentia's pre-trained models are not used. All bundled third-party components
and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (also in
the app: *Help › Third-Party Licenses*).
