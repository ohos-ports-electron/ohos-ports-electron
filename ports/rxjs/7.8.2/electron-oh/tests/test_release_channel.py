import contextlib
import copy
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import release_channel as channel


class ChannelTests(unittest.TestCase):
    def setUp(self):
        self.package = '@ohos-ports-electron/example'
        self.version = '1.0.0-electron-oh.0'
        self.policy = channel.resolve_policy(self.package, self.version)
        self.config = {'packageName': self.package, 'version': self.version,
                       'distTag': 'beta', 'requiredDistTags': ['latest', 'beta']}
        self.argv = ['npm', 'publish', '/abs/electron-oh/candidate.tgz',
                     '--tag', 'beta', '--access', 'public', '--ignore-scripts']
        self.registry = {'name': self.package, 'dist-tags': {'latest': self.version, 'beta': self.version}}
        self.catalog = {'name': self.package, 'dist_tags': dict(self.registry['dist-tags']),
                        'beta_version': self.version}
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, name, data):
        path = self.root / name
        path.write_text(json.dumps(data), encoding='utf-8')
        return path

    def invoke(self, args):
        with patch.object(sys, 'argv', ['release_channel.py', *args]), contextlib.redirect_stdout(io.StringIO()) as output:
            result = channel.main()
        return result, json.loads(output.getvalue())

    def base_args(self, command):
        return [command, '--package', self.package, '--version', self.version,
                '--config', str(self.write('config.json', self.config))]

    def test_formal_frozen_candidate_staging_requires_the_same_explicit_channel(self):
        channel.check_publish_command(['npm', 'stage', 'publish', 'candidate.tgz', '--tag', 'beta'], self.policy)
        for argv in (['npm', 'stage', 'publish', 'candidate.tgz'], ['npm', 'stage', 'publish', 'candidate.tgz', '--tag', 'electron-oh']):
            with self.assertRaises(ValueError):channel.check_publish_command(argv, self.policy)

    def test_all_supported_active_config_shapes(self):
        for identity in ({'packageName': self.package, 'version': self.version},
                         {'targetPackage': self.package, 'targetVersion': self.version},
                         {'candidate': {'name': self.package, 'version': self.version}}):
            channel.check_config({**identity, 'distTag': 'beta', 'requiredDistTags': ['beta', 'latest']}, self.policy)

    def test_old_config_cannot_authorize_itself(self):
        old = {**self.config, 'distTag': 'electron-oh', 'requiredDistTags': ['latest', 'electron-oh'],
               'channelSource': 'explicit user override of skill beta default'}
        with self.assertRaisesRegex(ValueError, 'distTag must be beta'):
            channel.check_config(old, self.policy)
        with self.assertRaises(ValueError):
            channel.resolve_policy(self.package, self.version, old)

    def test_required_tags_must_be_complete_unique_and_current(self):
        for tags in (['beta'], ['latest', 'electron-oh'], ['latest', 'beta', 'electron-oh'],
                     ['latest', 'beta', 'beta'], 'latest,beta', [[], 'beta']):
            with self.subTest(tags=tags), self.assertRaises(ValueError):
                channel.check_config({**self.config, 'requiredDistTags': tags}, self.policy)

    def test_conflicting_identity_alias_is_rejected(self):
        for extra in ({'targetPackage': '@ohos-ports-electron/other'}, {'targetVersion': '2.0.0'},
                      {'candidate': {'name': self.package, 'version': '2.0.0'}}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                channel.check_config({**self.config, **extra}, self.policy)

    def test_explicit_override_remains_possible_with_traceable_instruction(self):
        override = {**self.config, 'distTag': 'electron-oh', 'requiredDistTags': ['latest', 'electron-oh'],
                    'catalogVersionField': 'electron_oh_version',
                    'userInstruction': '覆盖当前 beta 策略，本次用 electron-oh 发布并维护 latest。',
                    'userInstructionSource': 'test fixture: explicit user message'}
        policy = channel.resolve_policy(self.package, self.version, override)
        channel.check_config(override, policy)
        channel.check_publish_command(['npm', 'publish', 'candidate.tgz', '--tag=electron-oh'], policy)
        for field in ('userInstruction', 'userInstructionSource'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                channel.resolve_policy(self.package, self.version, {**override, field: ''})
        with self.assertRaises(ValueError):
            channel.resolve_policy(self.package, '2.0.0', override)

    def test_unknown_scope_does_not_inherit_a_guessed_policy(self):
        with self.assertRaises(ValueError):
            channel.resolve_policy('@other/example', self.version)

    def test_frozen_metadata_and_electron_oh_version_are_not_rewritten(self):
        config = {**self.config, 'publishConfig': {'tag': 'electron-oh'},
                  'workflow': 'example-electron-oh.yml', 'directory': 'electron-oh/'}
        before = copy.deepcopy(config)
        channel.check_config(config, self.policy)
        channel.check_publish_command(self.argv, self.policy)
        self.assertEqual(config, before)

    def test_explicit_tag_options_and_absolute_npm_path(self):
        channel.check_publish_command(self.argv, self.policy)
        channel.check_publish_command(['/opt/node/bin/npm', 'publish', 'candidate.tgz',
                                       '--tag=beta', '--provenance', '--registry=https://registry.npmjs.org'], self.policy)

    def test_wrong_missing_duplicate_abbreviated_or_hidden_tags_are_rejected(self):
        cases = [[], ['--tag', 'electron-oh'], ['--tag', 'beta', '--tag=electron-oh'],
                 ['--tag', 'beta', '--tag=beta'], ['-t', 'beta'], ['--ta=beta'],
                 ['--tag=beta', '--t=electron-oh'], ['--tag'], ['--tag=beta', '--userconfig=x']]
        for options in cases:
            with self.subTest(options=options), self.assertRaises(ValueError):
                channel.check_publish_command(['npm', 'publish', 'candidate.tgz', *options], self.policy)

    def test_publish_only_accepts_a_single_tgz_without_a_shell(self):
        for argv in (['sh', '-c', 'npm publish candidate.tgz --tag beta'],
                     ['npm', 'publish', '.', '--tag', 'beta'],
                     ['npm', 'publish', 'one.tgz', 'two.tgz', '--tag', 'beta']):
            with self.subTest(argv=argv), self.assertRaises(ValueError):
                channel.check_publish_command(argv, self.policy)

    def test_bad_publish_is_blocked_before_any_process_starts(self):
        with patch.object(channel.subprocess, 'run') as run:
            with self.assertRaises(ValueError):
                channel.checked_publish(['npm', 'publish', 'candidate.tgz', '--tag', 'electron-oh'],
                                        [self.config], self.policy)
            old = {**self.config, 'distTag': 'electron-oh'}
            with self.assertRaises(ValueError):
                channel.checked_publish(self.argv, [old], self.policy)
            run.assert_not_called()

    def test_executed_argv_is_the_validated_argv(self):
        with patch.object(channel.subprocess, 'run') as run:
            channel.checked_publish(self.argv, [self.config], self.policy)
            run.assert_called_once_with(self.argv, check=True)

    def test_each_tag_write_is_bound_to_policy_and_version(self):
        for tag in ('latest', 'beta'):
            channel.check_tag_write(tag, self.version, self.policy)
        for tag, version in (('electron-oh', self.version), ('beta', '2.0.0')):
            with self.subTest(tag=tag, version=version), self.assertRaises(ValueError):
                channel.check_tag_write(tag, version, self.policy)

    def test_already_published_without_beta_does_not_pass_acceptance(self):
        registry = {'name': self.package, 'versions': {self.version: {}},
                    'dist-tags': {'latest': self.version, 'electron-oh': self.version}}
        with self.assertRaises(ValueError):
            channel.check_registry(registry, self.policy)

    def test_historical_legacy_tag_can_remain_without_becoming_required(self):
        self.registry['dist-tags']['electron-oh'] = '0.9.0-electron-oh.0'
        self.catalog['dist_tags'] = dict(self.registry['dist-tags'])
        before = copy.deepcopy((self.registry, self.catalog))
        channel.check_registry(self.registry, self.policy)
        channel.check_catalog([self.catalog], self.policy)
        self.assertEqual((self.registry, self.catalog), before)

    def test_site_cannot_substitute_legacy_field_or_tag(self):
        for changes in ({'beta_version': None, 'electron_oh_version': self.version},
                        {'beta_version': '2.0.0'},
                        {'dist_tags': {'latest': self.version, 'electron-oh': self.version}}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                channel.check_catalog({**self.catalog, **changes}, self.policy)
        with self.assertRaises(ValueError):
            channel.check_catalog([self.catalog, self.catalog], self.policy)

    def test_json_duplicate_keys_are_not_silently_overridden(self):
        path = self.root / 'duplicate.json'
        path.write_text('{"distTag":"electron-oh","distTag":"beta"}', encoding='utf-8')
        with self.assertRaises(ValueError):
            channel.read_json(path)

    def test_cli_check_verify_and_run_publish(self):
        result, output = self.invoke(self.base_args('check'))
        self.assertEqual((result, output['status']), (0, 'passed'))
        args = self.base_args('verify') + ['--registry-document', str(self.write('registry.json', self.registry)),
                                          '--catalog-document', str(self.write('catalog.json', [self.catalog]))]
        self.assertEqual(self.invoke(args)[0], 0)
        self.registry['dist-tags'].pop('beta')
        self.write('registry.json', self.registry)
        result, output = self.invoke(args)
        self.assertEqual((result, output['status']), (1, 'failed'))
        with patch.object(channel.subprocess, 'run') as run:
            self.assertEqual(self.invoke(self.base_args('run-publish') + ['--', *self.argv])[0], 0)
            run.assert_called_once_with(self.argv, check=True)

    def test_npm_failure_does_not_emit_sensitive_argv(self):
        argv = [*self.argv, '--otp', 'sensitive-test-value']
        with patch.object(channel.subprocess, 'run', side_effect=subprocess.CalledProcessError(7, argv)):
            result, output = self.invoke(self.base_args('run-publish') + ['--', *argv])
        self.assertEqual((result, output['status']), (1, 'failed'))
        self.assertNotIn('sensitive-test-value', json.dumps(output))

    def test_checker_works_when_copied_into_an_independent_port(self):
        tool = self.root / 'port' / 'electron-oh' / 'tools' / 'release_channel.py'
        tool.parent.mkdir(parents=True)
        shutil.copyfile(channel.__file__, tool)
        args = self.base_args('check')
        run = subprocess.run([sys.executable, str(tool), *args], cwd=self.root,
                             capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)['distTag'], 'beta')


if __name__ == '__main__':
    unittest.main()
