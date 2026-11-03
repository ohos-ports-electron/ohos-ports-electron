"""Catalog metadata regression checks; no network requests or generated data."""
import importlib.util
from pathlib import Path
import unittest
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


if __name__ == "__main__":
    unittest.main()
