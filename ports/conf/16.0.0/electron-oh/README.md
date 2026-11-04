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
