#!/usr/bin/env python3
"""Negative release tests: untrusted events, blocked evidence and artifact tampering."""
import argparse
import copy
import gzip
import hashlib
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
import frozen_archive

BUNDLE = None
EVIDENCE_ARCHIVE = None


class ReleaseContract(unittest.TestCase):
    def test_cross_platform_gzip_preserves_the_tested_archive(self):
        raw = b'same tar bytes for cross-platform compression contract' * 100
        frozen = gzip.compress(raw, compresslevel=9, mtime=0)
        replay = gzip.compress(raw, compresslevel=1, mtime=0)
        self.assertNotEqual(frozen, replay)
        lock = {'candidateSha256': hashlib.sha256(frozen).hexdigest(),
                'candidateTarSha256': hashlib.sha256(raw).hexdigest(),
                'candidateArchiveUrl': 'https://example.invalid/frozen.tgz'}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'candidate.tgz'
            path.write_bytes(replay)
            response = mock.MagicMock()
            response.__enter__.return_value = response
            response.geturl.return_value = lock['candidateArchiveUrl']
            response.read.return_value = frozen
            with mock.patch.object(frozen_archive.urllib.request, 'urlopen', return_value=response):
                result = frozen_archive.freeze_archive(path, lock)
            self.assertTrue(result['frozenArchiveDownloaded'])
            self.assertEqual(path.read_bytes(), frozen)
            self.assertEqual((path.parent / 'repacked.tgz').read_bytes(), replay)
            with mock.patch.object(frozen_archive.urllib.request, 'urlopen') as network:
                self.assertFalse(frozen_archive.freeze_archive(path, lock)['frozenArchiveDownloaded'])
                network.assert_not_called()

    def test_changed_reconstruction_is_rejected_before_download(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'candidate.tgz'
            path.write_bytes(gzip.compress(b'changed package'))
            with mock.patch.object(frozen_archive.urllib.request, 'urlopen') as network:
                with self.assertRaisesRegex(ValueError, 'reconstructed tar differs'):
                    frozen_archive.freeze_archive(path, {'candidateTarSha256': '0' * 64})
                network.assert_not_called()

    def test_downloaded_candidate_with_wrong_bytes_is_rejected(self):
        raw = b'same tar bytes'
        replay = gzip.compress(raw, compresslevel=1)
        lock = {'candidateSha256': '0' * 64, 'candidateTarSha256': hashlib.sha256(raw).hexdigest(),
                'candidateArchiveUrl': 'https://example.invalid/frozen.tgz'}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'candidate.tgz'
            path.write_bytes(replay)
            response = mock.MagicMock()
            response.__enter__.return_value = response
            response.geturl.return_value = lock['candidateArchiveUrl']
            response.read.return_value = b'corrupt download'
            with mock.patch.object(frozen_archive.urllib.request, 'urlopen', return_value=response):
                with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                    frozen_archive.freeze_archive(path, lock)
            self.assertEqual(path.read_bytes(), replay)

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

    def test_post_publish_waits_only_for_registry_visibility(self):
        meta = {'dist': {'integrity': 'sha512-same'}}
        with mock.patch.object(release, 'existing_version', side_effect=[None, None, meta]) as registry, \
             mock.patch.object(release.time, 'sleep') as sleep:
            self.assertEqual(release.wait_for_publication({}, 'sha512-same', attempts=3), 'already-published')
            self.assertEqual(registry.call_count, 3)
            self.assertEqual(sleep.call_count, 2)
        for result in [ValueError('registry HTTP 401'), {'dist': {'integrity': 'sha512-other'}}]:
            with mock.patch.object(release, 'existing_version', side_effect=result if isinstance(result, Exception) else [result]) as registry, \
                 mock.patch.object(release.time, 'sleep') as sleep:
                with self.assertRaises(ValueError):
                    release.wait_for_publication({}, 'sha512-same')
                self.assertEqual(registry.call_count, 1)
                sleep.assert_not_called()
        with mock.patch.object(release, 'existing_version', return_value=None) as registry, \
             mock.patch.object(release.time, 'sleep') as sleep:
            with self.assertRaisesRegex(ValueError, 'visibility timed out'):
                release.wait_for_publication({}, 'sha512-same', attempts=2)
            self.assertEqual(registry.call_count, 2)
            self.assertEqual(sleep.call_count, 1)

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
