#!/usr/bin/env python3
"""Negative release tests: untrusted events, blocked evidence and artifact tampering."""
import argparse
import copy
import io
import json
from pathlib import Path
import shutil
import sys
import tarfile
import tempfile
import unittest
from unittest import mock
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import release

BUNDLE = None
EVIDENCE_ARCHIVE = None


class ReleaseContract(unittest.TestCase):
    def context(self):
        _, _, p = release.check_recipe()
        return {'ENABLE_ELECTRON_OH_PUBLISH': '1', 'GITHUB_ACTIONS': 'true',
                'NAPI_RS_CANVAS_PUBLISH_MODE': 'oidc',
                'GITHUB_REPOSITORY': p['repository'], 'GITHUB_EVENT_NAME': 'push',
                'GITHUB_REF': 'refs/heads/main', 'GITHUB_ENVIRONMENT': p['environment'],
                'GITHUB_WORKFLOW_REF': p['repository'] + '/.github/workflows/' + p['workflow'] + '@refs/heads/main',
                'GITHUB_SHA': release.git_commit()}

    def test_recipe_and_evidence_consistency(self):
        release.check_recipe()

    def test_default_publish_is_disabled(self):
        _, _, p = release.check_recipe()
        with self.assertRaisesRegex(ValueError, 'disabled'):
            release.publish_context({}, p)

    def test_event_repository_branch_workflow_environment_and_sha(self):
        _, _, p = release.check_recipe()
        valid = self.context()
        release.publish_context(valid, p)
        for key, bad in [('NAPI_RS_CANVAS_PUBLISH_MODE', 'disabled'), ('GITHUB_ACTIONS', 'false'), ('GITHUB_REPOSITORY', 'fork/other'),
                         ('GITHUB_EVENT_NAME', 'pull_request'), ('GITHUB_EVENT_NAME', 'workflow_dispatch'),
                         ('GITHUB_REF', 'refs/heads/feature'), ('GITHUB_ENVIRONMENT', 'other'),
                         ('GITHUB_WORKFLOW_REF', 'other.yml'), ('GITHUB_SHA', '0' * 40)]:
            with self.subTest(key=key, bad=bad), self.assertRaises(ValueError):
                release.publish_context({**valid, key: bad}, p)

    def test_blocked_publish_never_contacts_npm_or_registry(self):
        context = self.context()
        lock, evidence, policy = release.check_recipe()
        evidence = copy.deepcopy(evidence)
        evidence['release'] = {'status': 'blocked', 'reasons': ['test gate']}
        with mock.patch.dict(release.os.environ, context, clear=True), \
             mock.patch.object(release, 'check_recipe', return_value=(lock, evidence, policy)), \
             mock.patch.object(release, 'git_commit', return_value=context['GITHUB_SHA']), \
             mock.patch.object(release.urllib.request, 'urlopen') as network, \
             mock.patch.object(release.subprocess, 'run') as npm:
            with self.assertRaisesRegex(ValueError, 'release blocked'):
                release.publish(Path('/missing-bundle'))
            network.assert_not_called()
            npm.assert_not_called()

    def test_clearing_status_does_not_replace_native_source_evidence(self):
        lock, evidence, _ = release.check_recipe()
        evidence = copy.deepcopy(evidence)
        lock = copy.deepcopy(lock)
        lock['nativeSourceRebuild'] = False
        evidence['release'] = {'status': 'ready', 'reasons': []}
        with self.assertRaisesRegex(ValueError, 'source-native'):
            release.require_ready(lock, evidence)

    def test_same_version_same_integrity_is_idempotent(self):
        self.assertEqual(release.check_existing({'dist': {'integrity': 'sha512-same'}}, 'sha512-same'), 'already-published')

    def test_same_version_different_bytes_refused(self):
        with self.assertRaisesRegex(ValueError, 'different bytes'):
            release.check_existing({'dist': {'integrity': 'sha512-old'}}, 'sha512-new')

    def test_only_http_404_means_new_version(self):
        _, _, policy = release.check_recipe()
        for code in (401, 403, 429, 500):
            error = urllib.error.HTTPError('https://registry.npmjs.org/test', code, 'test', {}, None)
            with mock.patch.object(release.urllib.request, 'urlopen', side_effect=error), self.assertRaises(ValueError):
                release.existing_version(policy)
        error = urllib.error.HTTPError('https://registry.npmjs.org/test', 404, 'test', {}, None)
        with mock.patch.object(release.urllib.request, 'urlopen', side_effect=error):
            self.assertEqual(release.check_existing(release.existing_version(policy), 'expected'), 'new-version')
        with mock.patch.object(release.urllib.request, 'urlopen', side_effect=urllib.error.URLError('offline')), self.assertRaises(urllib.error.URLError):
            release.existing_version(policy)

    def test_unsafe_and_duplicate_tar_members_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            tgz = Path(directory) / 'bad.tgz'
            for names in [['../outside'], ['package/package.json', 'package/package.json']]:
                with tarfile.open(tgz, 'w:gz') as archive:
                    for name in names:
                        data = b'{}'
                        item = tarfile.TarInfo(name)
                        item.size = len(data)
                        archive.addfile(item, io.BytesIO(data))
                with self.assertRaises(ValueError):
                    release.inventory(tgz)

    def test_actual_bundle_and_tamper_rejection(self):
        if BUNDLE is None:
            self.skipTest('run with --bundle after building to check actual artifact tampering')
        release.verify_bundle(BUNDLE)
        with tempfile.TemporaryDirectory() as directory:
            copy_dir = Path(directory)
            for name in ('candidate.tgz', 'candidate.json', 'bundle.json'):
                shutil.copy2(BUNDLE / name, copy_dir / name)
            manifest = release.read(copy_dir / 'candidate.json')
            manifest['packageFiles']['index.js'] = '0' * 64
            release.write(copy_dir / 'candidate.json', manifest)
            bundle = release.read(copy_dir / 'bundle.json')
            bundle['candidateManifestSha256'] = release.sha(copy_dir / 'candidate.json')
            release.write(copy_dir / 'bundle.json', bundle)
            with self.assertRaisesRegex(ValueError, 'reviewed evidence'):
                release.verify_bundle(copy_dir)
            shutil.copy2(BUNDLE / 'candidate.json', copy_dir / 'candidate.json')
            bundle = release.read(BUNDLE / 'bundle.json')
            bundle['recipeFiles']['build.sh'] = '0' * 64
            release.write(copy_dir / 'bundle.json', bundle)
            with self.assertRaisesRegex(ValueError, 'current checkout'):
                release.verify_bundle(copy_dir)

    def test_source_evidence_archive_and_tamper(self):
        if EVIDENCE_ARCHIVE is None:
            self.skipTest('run with --evidence-archive to verify the full historical JSON evidence')
        _, evidence, _ = release.check_recipe()
        data = EVIDENCE_ARCHIVE.read_bytes()
        release.verify_evidence_archive(data, evidence)
        with self.assertRaisesRegex(ValueError, 'archive mismatch'):
            release.verify_evidence_archive(data + b'tamper', evidence)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', type=Path)
    parser.add_argument('--evidence-archive', type=Path)
    args, remaining = parser.parse_known_args()
    BUNDLE = args.bundle
    EVIDENCE_ARCHIVE = args.evidence_archive
    unittest.main(argv=[sys.argv[0]] + remaining)
