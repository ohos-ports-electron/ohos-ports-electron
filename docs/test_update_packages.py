"""Catalog metadata regression checks; no network requests or generated data."""
import importlib.util
from pathlib import Path
import unittest
import json
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("update_packages", Path(__file__).with_name("update-packages.py"))
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class PackageDescription(unittest.TestCase):
    def detail(self, data):
        name = "@ohos-ports-electron/example"
        cache = {name: {"original_name": "example"}}
        with patch.object(catalog, "fetch_json", return_value=data):
            return catalog.fetch_package_detail(name, cache)

    def test_promoted_staged_release_uses_latest_description(self):
        package = self.detail({
            "description": "Temporary package placeholder for staged publishing",
            "dist-tags": {"latest": "2.0.1-electron-oh.0"},
            "versions": {
                "0.0.0-stage": {"stub": True, "description": "Temporary package placeholder for staged publishing"},
                "2.0.1-electron-oh.0": {"description": "Real regular expression engine"},
                "9.0.0-beta.1": {"description": "Unselected preview"},
            },
        })
        self.assertEqual(package["description"], "Real regular expression engine")
        self.assertEqual(package["latest_version"], "2.0.1-electron-oh.0")

    def test_missing_latest_description_retains_root_fallback(self):
        package = self.detail({"description": "Existing package", "dist-tags": {"latest": "1.0.0"}, "versions": {"1.0.0": {}}})
        self.assertEqual(package["description"], "Existing package")

    def test_missing_root_and_latest_descriptions_retains_history_fallback(self):
        package = self.detail({"dist-tags": {"latest": "1.1.0"}, "versions": {"1.1.0": {}, "1.0.0": {"description": "Historical description"}}})
        self.assertEqual(package["description"], "Historical description")

    def test_beta_tag_is_not_replaced_by_newer_latest_version(self):
        package = self.detail({"dist-tags": {"latest": "2.0.0-beta.3", "beta": "2.0.0-beta.1"}, "versions": {}})
        self.assertEqual(package["latest_version"], "2.0.0-beta.3")
        self.assertEqual(package["beta_version"], "2.0.0-beta.1")

    def test_beta_in_version_name_does_not_create_a_beta_tag(self):
        package = self.detail({"dist-tags": {"latest": "2.0.0-beta.3"}, "versions": {}})
        self.assertIsNone(package["beta_version"])

    def test_electron_oh_version_suffix_can_be_selected_by_beta_tag(self):
        package = self.detail({"dist-tags": {"latest": "2.0.0-electron-oh.0", "beta": "2.0.0-electron-oh.0"}, "versions": {}})
        self.assertEqual(package["beta_version"], "2.0.0-electron-oh.0")
        self.assertIsNone(package["electron_oh_version"])


class DeclaredUpstream(unittest.TestCase):
    def detail(self, declaration, version="1.18.0-electron-oh.0"):
        name = "@ohos-ports-electron/vscode-ripgrep"
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / "vscode-ripgrep/1.18.0/electron-oh/inputs.lock.json"
            lock.parent.mkdir(parents=True)
            lock.write_text(json.dumps({
                "candidate": {"name": name, "version": "1.18.0-electron-oh.0"},
                "upstreamName": declaration,
            }))
            data = {"name": name, "dist-tags": {"latest": version}, "versions": {version: {}}}
            cache = {name: {"original_name": "vscode-ripgrep"}}
            with patch.object(catalog, "PORTS_DIR", directory), patch.object(catalog, "fetch_json", return_value=data), patch.object(catalog, "package_exists", side_effect=AssertionError("unexpected name guess")):
                return catalog.fetch_package_detail(name, cache)

    def test_scoped_recipe_identity_replaces_an_ambiguous_cached_guess(self):
        package = self.detail("@vscode/ripgrep")
        self.assertEqual(package["original_name"], "@vscode/ripgrep")
        self.assertEqual(package["original_npm_url"], "https://www.npmjs.com/package/@vscode/ripgrep")

    def test_declaration_for_another_version_keeps_existing_cache(self):
        self.assertEqual(self.detail("@vscode/ripgrep", "0.0.0-stage")["original_name"], "vscode-ripgrep")

    def test_invalid_package_identity_keeps_existing_cache(self):
        self.assertEqual(self.detail("../../invalid")["original_name"], "vscode-ripgrep")


if __name__ == "__main__":
    unittest.main()
