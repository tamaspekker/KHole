# Building KHole from source

## Requirements and build

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

**`tauri build` fails with “Failed to create app Assets.car … attempt to insert nil
object”?** That is an Xcode 26 `actool` bug with the Liquid Glass icon: its first run
fails. Build through the retry wrapper:

```sh
PATH="$PWD/scripts/actool-retry:$PATH" npm run tauri build
```

## Tech stack

- [Tauri 2](https://tauri.app/) with a Rust backend (file operations, SQLite, waveform peaks)
- React + TypeScript + [shadcn/ui](https://ui.shadcn.com/) + Tailwind CSS
- `khole-analyze`: a small C++ sidecar on top of Essentia for BPM/key detection
  (`sidecar/khole-analyze/`). It reads mono f32le PCM on stdin and prints JSON.

## Releasing

1. Bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
   `package.json`, and write `docs/release-notes/v<version>.md`.
2. `node scripts/third-party-notices.mjs` if dependencies changed; commit.
3. `git tag v<version> && git push origin v<version>`. The *Release* workflow builds the
   `.dmg` and creates a **draft** GitHub release; review and publish it.
