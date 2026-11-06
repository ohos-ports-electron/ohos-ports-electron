#!/usr/bin/env python3
"""Check active release channels; run only a validated explicit-tag npm publish."""
import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import re
import subprocess


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'duplicate JSON key: {key}')
        result[key] = value
    return result


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique_object)


@dataclass(frozen=True)
class Policy:
    package: str
    version: str
    tag: str
    required_tags: tuple
    catalog_field: str


def resolve_policy(package, version, override=None):
    require(isinstance(package, str) and re.fullmatch(r'(?:@[^/@\s]+/)?[^/@\s]+', package),
            'invalid target package')
    require(isinstance(version, str) and re.fullmatch(
        r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?', version),
        'an exact target version is required')
    if override is None:
        require(package.startswith('@ohos-ports-electron/'),
                'other scopes require an explicit channel policy with user instruction/source')
        return Policy(package, version, 'beta', ('latest', 'beta'), 'beta_version')
    require(isinstance(override, dict), 'override must be an object')
    require(override.get('packageName') == package and override.get('version') == version,
            'override must match the exact target package and version')
    for key in ('userInstruction', 'userInstructionSource'):
        require(isinstance(override.get(key), str) and override[key].strip(),
                f'override requires {key}; an agent-generated override claim is insufficient')
    tag = override.get('distTag')
    tags = override.get('requiredDistTags')
    require(isinstance(tags, list) and tags and all(
        isinstance(t, str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9._-]*', t) for t in tags),
        'override requires an explicit list of valid requiredDistTags')
    require(isinstance(tag, str) and tag in tags and len(tags) == len(set(tags)),
            'override tag must be in the unique requiredDistTags list')
    field = override.get('catalogVersionField')
    require(isinstance(field, str) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', field),
            'override requires catalogVersionField')
    return Policy(package, version, tag, tuple(tags), field)


def check_config(config, policy):
    require(isinstance(config, dict), 'active configuration must be an object')
    require(config.get('distTag') == policy.tag, f'active distTag must be {policy.tag}')
    tags = config.get('requiredDistTags')
    require(isinstance(tags, list) and all(isinstance(t, str) for t in tags)
            and len(tags) == len(set(tags)) and set(tags) == set(policy.required_tags),
            'active requiredDistTags must match the resolved policy')
    names = [config[k] for k in ('targetPackage', 'packageName') if k in config]
    versions = [config[k] for k in ('targetVersion', 'version') if k in config]
    if 'candidate' in config:
        candidate = config['candidate']
        require(isinstance(candidate, dict), 'candidate identity must be an object')
        names.append(candidate.get('name'))
        versions.append(candidate.get('version'))
    require(names and all(name == policy.package for name in names),
            'configuration package identity missing or mismatched')
    require(versions and all(version == policy.version for version in versions),
            'configuration version identity missing or mismatched')


def check_publish_command(argv, policy):
    """Reject ambiguous npm options instead of guessing npm's abbreviation resolution."""
    require(isinstance(argv, (list, tuple)) and len(argv) >= 3
            and all(isinstance(arg, str) and arg for arg in argv), 'expected an npm publish argv array')
    staged = argv[1:3] == ['stage', 'publish']
    require(Path(argv[0]).name in ('npm', 'npm.cmd') and (argv[1] == 'publish' or staged),
            'expected npm publish or npm stage publish without a shell or npm option prefix')
    value_options = {'--tag', '--access', '--registry', '--otp', '--provenance-file'}
    bool_options = {'--ignore-scripts', '--provenance', '--dry-run', '--json'}
    payloads, tags = [], []
    index = 3 if staged else 2
    while index < len(argv):
        arg = argv[index]
        if not arg.startswith('-'):
            payloads.append(arg)
        else:
            key, equal, value = arg.partition('=')
            require(key in value_options | bool_options,
                    'unsupported npm option; use reviewed full option names')
            if key in value_options:
                if not equal:
                    index += 1
                    require(index < len(argv), 'missing npm option value')
                    value = argv[index]
                require(value and not value.startswith('-'), 'invalid npm option value')
                if key == '--tag':
                    tags.append(value)
            else:
                require(not equal or value in ('true', 'false'), 'invalid npm boolean option')
        index += 1
    require(len(payloads) == 1 and payloads[0].endswith('.tgz'), 'publish exactly one frozen tgz')
    require(tags == [policy.tag], f'publish requires exactly one explicit --tag {policy.tag}')


def checked_publish(argv, configs, policy):
    """Validate and execute the same argv; outer release/identity/byte guards remain required."""
    argv = list(argv)
    require(configs, 'at least one active configuration is required')
    for config in configs:
        check_config(config, policy)
    check_publish_command(argv, policy)
    return subprocess.run(argv, check=True)  # No shell and no command reconstruction after validation.


def check_tag_write(tag, version, policy):
    require(tag in policy.required_tags, 'tag write is outside the resolved release policy')
    require(version == policy.version, 'tag write targets a different version')


def check_registry(document, policy):
    require(isinstance(document, dict) and document.get('name') == policy.package,
            'registry document package mismatch')
    tags = document.get('dist-tags')
    require(isinstance(tags, dict) and all(tags.get(tag) == policy.version for tag in policy.required_tags),
            'registry required tags do not all point to the target version')


def check_catalog(document, policy):
    if isinstance(document, list):
        matches = [entry for entry in document if isinstance(entry, dict) and entry.get('name') == policy.package]
        require(len(matches) == 1, 'catalog must contain exactly one target package')
        document = matches[0]
    require(isinstance(document, dict) and document.get('name') == policy.package,
            'catalog package mismatch')
    require(document.get(policy.catalog_field) == policy.version,
            f'catalog {policy.catalog_field} must match the target version')
    tags = document.get('dist_tags')
    require(isinstance(tags, dict) and all(tags.get(tag) == policy.version for tag in policy.required_tags),
            'catalog dist_tags do not match the registry release policy')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('check', 'run-publish', 'verify'):
        command = commands.add_parser(name)
        command.add_argument('--package', required=True)
        command.add_argument('--version', required=True)
        command.add_argument('--config', type=Path, action='append', required=True)
        command.add_argument('--override', type=Path)
        if name == 'check':
            command.add_argument('--publish-command', type=Path, help='Optional actual npm argv JSON array')
        elif name == 'verify':
            command.add_argument('--registry-document', type=Path, required=True)
            command.add_argument('--catalog-document', type=Path, required=True)
        else:
            command.add_argument('argv', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        override = read_json(args.override) if args.override else None
        policy = resolve_policy(args.package, args.version, override)
        configs = [read_json(path) for path in args.config]
        for config in configs:
            check_config(config, policy)
        if args.command == 'check' and args.publish_command:
            check_publish_command(read_json(args.publish_command), policy)
        elif args.command == 'run-publish':
            argv = args.argv[1:] if args.argv[:1] == ['--'] else args.argv
            checked_publish(argv, configs, policy)
        elif args.command == 'verify':
            check_registry(read_json(args.registry_document), policy)
            check_catalog(read_json(args.catalog_document), policy)
        print(json.dumps({'status': 'passed', 'phase': args.command, 'packageName': policy.package,
                          'version': policy.version, 'distTag': policy.tag,
                          'requiredDistTags': list(policy.required_tags)}, ensure_ascii=False))
        return 0
    except subprocess.CalledProcessError as error:
        # Do not serialize argv: it may contain an OTP or other authentication options.
        print(json.dumps({'status': 'failed', 'error': 'npm publish failed', 'exitCode': error.returncode}))
        return 1
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(json.dumps({'status': 'failed', 'error': str(error)}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
