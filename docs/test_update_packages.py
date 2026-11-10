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


class ProcessCompatibility(unittest.TestCase):
    name = "@ohos-ports-electron/conf"

    def generate(self, annotation, beta="1.0.0-electron-oh.0", override=None, npm_deprecated=False):
        package = {
            "name": self.name, "latest_version": "2.0.0-electron-oh.0",
            "electron_oh_version": None, "dist_tags": {}, "stable_version": None,
            "beta_version": beta, "description": "", "deprecated": npm_deprecated,
            "deprecated_message": "npm reason" if npm_deprecated else None, "npm_url": "https://www.npmjs.com/package/" + self.name,
            # npm 自带的同名字段不能成为兼容结论。
            "main": True, "renderer": True,
        }
        with tempfile.TemporaryDirectory() as directory:
            mapping = Path(directory) / "process-compatibility.json"
            source = json.dumps({self.name: annotation} if annotation is not None else {})
            mapping.write_text(source)
            overrides = Path(directory) / "package-overrides.json"
            overrides.write_text(json.dumps({self.name: override} if override else {}))
            output = Path(directory) / "packages.jsonl"
            with patch.multiple(catalog, PROCESS_COMPATIBILITY_PATH=str(mapping),
                                PACKAGE_OVERRIDES_PATH=str(overrides),
                                DATA_DIR=directory, JSONL_PATH=str(output),
                                INDEX_PATH=str(Path(directory) / "index.json")):
                result = catalog.generate_output([package], {})
                self.assertEqual(json.loads(output.read_text()), result[0])
                # 第二次同步仍应保留标注，且不能改写人工维护的映射。
                self.assertEqual(catalog.generate_output([package], {}), result)
                self.assertEqual(mapping.read_text(), source)
                return result[0]

    def test_missing_or_empty_annotation_stays_unknown(self):
        for annotation in (None, {"version": None, "main": None, "renderer": None}):
            with self.subTest(annotation=annotation):
                package = self.generate(annotation)
                self.assertIsNone(package["main"])
                self.assertIsNone(package["renderer"])

    def test_latest_version_annotation_survives_repeated_refresh(self):
        package = self.generate({"version": "2.0.0-electron-oh.0", "main": True, "renderer": False})
        self.assertIs(package["main"], True)
        self.assertIs(package["renderer"], False)

    def test_old_beta_annotation_does_not_apply_to_new_latest(self):
        package = self.generate({"version": "1.0.0-electron-oh.0", "main": True, "renderer": True, "electron": ["37"], "renderer_status": "preliminary", "renderer_note": "old annotation"})
        self.assertIsNone(package["main"])
        self.assertIsNone(package["renderer"])
        self.assertEqual(package["electron"], [])
        self.assertIsNone(package["renderer_status"])
        self.assertIsNone(package["renderer_note"])

    def test_without_beta_annotation_matches_latest(self):
        package = self.generate({"version": "2.0.0-electron-oh.0", "main": None, "renderer": True}, beta=None)
        self.assertIsNone(package["main"])
        self.assertIs(package["renderer"], True)

    def test_invalid_flags_and_unversioned_claims_stop_generation(self):
        for annotation in ({"version": "1.0.0", "main": "true"},
                           {"version": "1.0.0", "renderer": 1},
                           {"version": None, "main": True}):
            with self.subTest(annotation=annotation), self.assertRaises(ValueError):
                self.generate(annotation)

    def test_electron_versions_and_preliminary_conditions_are_preserved(self):
        package = self.generate({"version": "2.0.0-electron-oh.0", "main": True, "renderer": True,
                                 "electron": ["34", "37"], "renderer_status": "preliminary",
                                 "renderer_note": "Use browser build", "evidence": ["record.json"]})
        self.assertEqual(package["electron"], ["34", "37"])
        self.assertEqual(package["renderer_status"], "preliminary")
        self.assertEqual(package["renderer_note"], "Use browser build")
        self.assertEqual(package["compatibility_evidence"], ["record.json"])

    def test_catalog_deprecation_survives_refresh_independently_of_compatibility(self):
        package = self.generate(None, override={"deprecated": True, "deprecated_message": "catalog reason"})
        self.assertIs(package["deprecated"], True)
        self.assertEqual(package["deprecated_source"], "catalog")
        self.assertEqual(package["deprecated_message"], "catalog reason")

    def test_npm_deprecation_keeps_its_own_reason(self):
        package = self.generate(None, override={"deprecated": True, "deprecated_message": "catalog reason"}, npm_deprecated=True)
        self.assertEqual(package["deprecated_source"], "npm")
        self.assertEqual(package["deprecated_message"], "npm reason")

    def test_invalid_electron_and_preliminary_metadata_stop_generation(self):
        for extra in ({"electron": "37"}, {"electron": ["37.2.0"]},
                      {"renderer_status": "preliminary", "renderer": None},
                      {"renderer_note": 123}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                self.generate({"version": "2.0.0-electron-oh.0", **extra})


if __name__ == "__main__":
    unittest.main()
