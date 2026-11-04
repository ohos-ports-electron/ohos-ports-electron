# conf maintenance and release

Build the locked registry baseline, apply only the ordered metadata patch,
retain upstream README and create deterministic gzip/tar bytes. The root README
lists all eight package files. Neither the root recipe README nor host tests
enter npm. ESM APIs/types and upstream dependency declarations remain intact.

A package-specific Trusted Publisher uses GitHub repository
`ohos-ports-electron/ohos-ports-electron`, workflow `conf-electron-oh.yml`,
environment `npm-publish`, branch main. Direct publication and dist-tag
permissions are independent. First manual publication does not demonstrate
future OIDC direct upload. The release tool verifies archived device evidence,
current recipe/commit, package inventory and both production tags.

Standard Node 18.15 lacks Array.toSorted. The corresponding CI role installs
upstream host Electron 25.3.2, verifies its actual Node/Electron versions and
toSorted capability, and runs all 35 assertions with ELECTRON_RUN_AS_NODE=1.
No global polyfill, changed package byte or skipped assertion is used.
Official mode reference: https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node
