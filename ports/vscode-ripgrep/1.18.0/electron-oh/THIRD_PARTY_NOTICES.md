# Native artifact provenance

bin/ohos-arm64/rg is the unchanged static aarch64 musl executable from
@vscode/ripgrep-linux-arm64@1.18.0. Its archive URL, SHA256/SHA512 and binary
fingerprint are locked in the public recipe. The local reference uses the same
bytes. There is no new native compilation in this port.

The original MIT license from that npm binary package is preserved at
licenses/vscode-ripgrep-native-LICENSE; the wrapper LICENSE is also preserved.
licenses/ripgrep-LICENSE-MIT retains Andrew Gallant's upstream MIT notice,
retrieved from the 15.0.0 tag. Microsoft labels the binary release v15.0.1:
https://github.com/microsoft/ripgrep-prebuilt/releases/tag/v15.0.1
The release config selects BurntSushi/ripgrep tag 15.0.0 plus its BinSkim
patch. The official release archive, npm artifact and local reference contain
the same binary bytes. Release and executable versions are recorded separately. Runtime/HAP provenance is outside the npm package.
