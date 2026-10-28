#!/usr/bin/env python3
"""Exercise release trust boundaries without publishing or changing the recipe."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import urllib.error

parser = argparse.ArgumentParser()
parser.add_argument('--bundle', type=Path)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('release', Path(__file__).resolve().parent.parent / 'tools/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class TrustContract(unittest.TestCase):
    def test_actual_recipe(self):
        release.check_recipe()

    def test_untrusted_publish_contexts(self):
        policy = release.read(release.ADAPTER / 'release-policy.json')
        valid = {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'push', 'GITHUB_REPOSITORY': policy['repository'],
                 'GITHUB_REF': policy['publishRef'], 'GITHUB_ENVIRONMENT': policy['environment'], 'GITHUB_SHA': 'abc',
                 'GITHUB_WORKFLOW_REF': policy['repository'] + '/.github/workflows/' + policy['workflowFilename'] + '@' + policy['publishRef']}
        release.check_context(valid, policy, 'abc')
        for key, values in {'GITHUB_EVENT_NAME': ['pull_request', 'workflow_dispatch'], 'GITHUB_REPOSITORY': ['fork/repo'],
                            'GITHUB_REF': ['refs/heads/feature'], 'GITHUB_ENVIRONMENT': ['other'],
                            'GITHUB_SHA': ['another-commit'], 'GITHUB_WORKFLOW_REF': ['other-workflow'],
                            'GITHUB_ACTIONS': ['false']}.items():
            for value in values:
                with self.subTest(key=key, value=value), self.assertRaisesRegex(ValueError, 'publish context rejected'):
                    release.check_context(dict(valid, **{key: value}), policy, 'abc')

    def test_blocked_and_unarchived_evidence(self):
        evidence = release.read(release.ADAPTER / 'release-evidence.json')
        # Exercise synthetic failures independently of the port's eventual ready status.
        evidence['release'] = {'status': 'blocked', 'reasons': ['synthetic pending evidence']}
        evidence['sourceEvidence'].update(reportsArchived=False, archiveUrl=None)
        evidence['releasePrerequisites']['standaloneNodeArchive'].update(status='missing', url=None, sha256=None)
        evidence['releasePrerequisites']['targetNpmLifecycle'].update(status='not-executed', reports=[])
        with self.assertRaisesRegex(ValueError, 'release is blocked'):
            release.check_ready(evidence)
        evidence['release'] = {'status': 'ready', 'reasons': []}
        with self.assertRaisesRegex(ValueError, 'must be archived'):
            release.check_ready(evidence)
        evidence['sourceEvidence'].update(reportsArchived=True, archiveUrl='https://example.invalid/evidence', archiveSha256='c' * 64)
        with self.assertRaisesRegex(ValueError, 'Node archive provenance incomplete'):
            release.check_ready(evidence)
        evidence['releasePrerequisites']['standaloneNodeArchive'].update(status='passed', url='https://example.invalid/node.tgz', sha256='a' * 64)
        with self.assertRaisesRegex(ValueError, 'npm CLI lifecycle evidence incomplete'):
            release.check_ready(evidence)
        lifecycle = evidence['releasePrerequisites']['targetNpmLifecycle']
        lifecycle.update(status='passed', reports=[
            {'runtimeId': runtime, 'execution': 'device', 'status': 'passed',
             'packageSha256': evidence['candidateSha256'], 'postinstallExecuted': True,
             'reportUrl': 'https://example.invalid/report', 'reportSha256': 'b' * 64}
            for runtime in evidence['requiredDeviceTargets']])
        release.check_ready(evidence)  # Synthetic metadata only; never saved or published.
        lifecycle['reports'][0]['packageSha256'] = 'c' * 64
        with self.assertRaisesRegex(ValueError, 'lifecycle report mismatch'):
            release.check_ready(evidence)

    def test_registry_errors_are_not_absent_versions(self):
        policy = release.read(release.ADAPTER / 'release-policy.json')
        def response(code):
            def open_error(*unused, **kwargs):
                raise urllib.error.HTTPError('https://registry.npmjs.org', code, 'test', {}, None)
            return open_error
        self.assertIsNone(release.registry_version(policy, response(404)))
        for code in [401, 403, 429, 500]:
            with self.subTest(code=code), self.assertRaisesRegex(ValueError, 'registry lookup failed'):
                release.registry_version(policy, response(code))
        def offline(*unused, **kwargs):
            raise urllib.error.URLError('offline')
        with self.assertRaises(urllib.error.URLError):
            release.registry_version(policy, offline)
        self.assertEqual(release.registry_action(None, 'expected'), 'publish')
        self.assertEqual(release.registry_action('expected', 'expected'), 'already-published')
        with self.assertRaisesRegex(ValueError, 'different bytes'):
            release.registry_action('other', 'expected')

    def test_bootstrap_only_creates_missing_package(self):
        release.check_bootstrap('synthetic-test-token', False)
        with self.assertRaisesRegex(ValueError, 'protected NPM_BOOTSTRAP_TOKEN'):
            release.check_bootstrap('', False)
        with self.assertRaisesRegex(ValueError, 'only creates a missing package'):
            release.check_bootstrap('synthetic-test-token', True)

    def test_bootstrap_package_lookup_fails_closed(self):
        policy = release.read(release.ADAPTER / 'release-policy.json')
        def response(code):
            def open_error(request, **kwargs):
                self.assertTrue(request.full_url.startswith('https://registry.npmjs.org/'))
                self.assertEqual(request.get_header('Authorization'), 'Bearer synthetic-test-token')
                raise urllib.error.HTTPError(request.full_url, code, 'test', {}, None)
            return open_error
        self.assertFalse(release.registry_package_exists(policy, 'synthetic-test-token', response(404)))
        for code in [401, 403, 429, 500]:
            with self.subTest(code=code), self.assertRaisesRegex(ValueError, 'authenticated package lookup failed'):
                release.registry_package_exists(policy, 'synthetic-test-token', response(code))

    @unittest.skipUnless(args.bundle, 'supply a sealed build bundle for artifact tampering checks')
    def test_artifact_bound_to_checkout(self):
        release.verify(args.bundle)
        with tempfile.TemporaryDirectory(prefix='onnx-release-contract-', dir=args.bundle.parent) as directory:
            bundle = Path(directory)
            for name in ('candidate.tgz', 'candidate.json', 'bundle.json'):
                os.link(args.bundle / name, bundle / name)
            # Replace the linked metadata, never edit the original inode.
            (bundle / 'bundle.json').unlink()
            manifest = release.read(args.bundle / 'bundle.json')
            manifest['recipeFiles']['electron-oh/inputs.lock.json'] = '0' * 64
            release.write(bundle / 'bundle.json', manifest)
            with self.assertRaisesRegex(ValueError, 'recipe differs'):
                release.verify(bundle)
            (bundle / 'candidate.tgz').unlink()
            (bundle / 'candidate.tgz').write_bytes(b'not-the-frozen-package')
            with self.assertRaisesRegex(ValueError, 'tgz SHA256'):
                release.verify_candidate(bundle)


unittest.main(argv=['release-contract'], verbosity=2)
