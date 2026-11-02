# tar build and release

The root recipe README explains all 250 distribution files and recipe roles.
Build.py locks original tar 7.5.22, replays only the distribution metadata patch,
preserves upstream README and emits deterministic tar/gzip bytes. Release.py
checks inventory, candidate, current recipe/CI commit and the public archive of
baseline/candidate device reports. Normal host install runs all 30 assertions,
including a real Worker roundtrip and exit. No simulated device result is used.

The package-specific trusted publisher is GitHub repository
ohos-ports-electron/ohos-ports-electron, workflow tar-electron-oh.yml,
environment npm-publish, branch main. Enable direct publication and independent
dist-tag management. A manual authenticated bootstrap, if required for the
first package, does not establish OIDC direct upload or provenance.
