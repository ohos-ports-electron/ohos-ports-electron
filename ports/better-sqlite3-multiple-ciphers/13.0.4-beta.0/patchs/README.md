# patchs — no standalone patch files

This port has **no patch files** in the `patchs/` directory. The candidate is
produced from the locked registry baseline by `electron-oh/tools/build.py`, which
applies the loader and static-entry changes inline (see `build.py`):

- `lib/binding.js`: `BETTER_SQLITE3_NATIVE_BINDING` env override (Electron hosts)
  and `'openharmony'` added to `PREBUILD_PLATFORMS` (standalone OHOS Node loader).
- `lib/{openharmony,ohos}-{arm64,x64}.js`: new static entry points mirroring the
  upstream `linux-*` entries (`ohos` because Electron-OH 40 reports
  `process.platform === 'ohos'`).
- `package.json`: `exports` gains the `./openharmony-*` and `./ohos-*` subpaths;
  identity metadata rewritten.
- `prebuilds/openharmony-arm64.node`: device-ABI addon injected by `build.py`
  (bytes locked in `inputs.lock.json`).

This mirrors the "zero-patch" convention (changes live in the build recipe, not
a `.patch` file) while remaining byte-reproducible from the locked baseline. The
full source-tree adaptation (including test-side environment adaptations used by
the device roster) is retained in the single-library project
(`.ohos-adaptation-pc/`), not in this aggregate checkout.
