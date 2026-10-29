#!/usr/bin/env python3
"""Bind the candidate to the current recipe; reject incomplete or untrusted releases."""
import argparse
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import struct
import subprocess
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request

ADAPTER = Path(__file__).resolve().parents[1]
PORT = ADAPTER.parent


def require(value, message):
    if not value:
        raise ValueError(message)


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def child(root, name):
    p = PurePosixPath(name)
    require(name and not p.is_absolute() and '..' not in p.parts and '\\' not in name, 'unsafe path: ' + name)
    target = root.joinpath(*p.parts)
    require(root.resolve() in target.resolve().parents and not target.is_symlink(), 'path escapes root: ' + name)
    return target


def recipe_files():
    result = {}
    for path in sorted(PORT.rglob('*')):
        if any(p in ('__pycache__', '.DS_Store') for p in path.relative_to(PORT).parts):
            continue
        require(not path.is_symlink(), 'recipe symlink is forbidden')
        if path.is_file():
            result[path.relative_to(PORT).as_posix()] = sha(path)
    return result


def git_commit():
    return subprocess.check_output(['git', '-C', str(PORT), 'rev-parse', 'HEAD'], text=True).strip()


def check_recipe():
    lock = read(ADAPTER / 'inputs.lock.json')
    evidence = read(ADAPTER / 'release-evidence.json')
    policy = read(ADAPTER / 'release-policy.json')
    require(lock['candidate'] == {'name': policy['packageName'], 'version': policy['packageVersion']}, 'lock identity mismatch')
    require((evidence['packageName'], evidence['packageVersion']) == (policy['packageName'], policy['packageVersion']), 'evidence identity mismatch')
    for domain in ('packagePatches', 'nativeSourcePatches'):
        for item in lock[domain]:
            require(sha(child(PORT, item['path'])) == item['sha256'], 'patch hash mismatch: ' + item['path'])
    listed = read(ADAPTER / 'package-inventory.json')
    require(listed['candidateSha256'] == lock['candidateSha256'] == evidence['candidateSha256'], 'candidate lock mismatch')
    require(listed['integrity'] == evidence['candidateIntegrity'], 'integrity lock mismatch')
    require({x['path']: x['sha256'] for x in listed['files']} == evidence['packageFiles'], 'package inventory mismatch')
    require(sha(ADAPTER / 'PACKAGE_README.md') == evidence['packageFiles']['README.md'], 'packaged README mirror mismatch')
    require(sha(PORT / 'LICENSE.upstream') == evidence['packageFiles']['LICENSE'], 'upstream license mismatch')
    native = read(ADAPTER / 'native-artifact.lock.json')
    for name, expected in lock['nativeAdapter']['outputs'].items():
        require(native['members'][name]['sha256'] == expected == evidence['packageFiles']['native/electron/' + name], 'native lock mismatch')
    for name, expected in lock['nodeNative']['outputs'].items():
        require(native['members'][name]['sha256'] == expected == evidence['packageFiles'][name], 'Node native lock mismatch')
    require(native['members']['native-source.json']['sha256'] == lock['nativeReceiptSha256'] == evidence['packageFiles']['native-source.json'], 'native receipt lock mismatch')
    notices = read(ADAPTER / 'licenses.lock.json')
    for name, expected in notices.items():
        require(sha(child(ADAPTER / 'licenses', name)) == expected == evidence['packageFiles']['licenses/' + name], 'notice mismatch: ' + name)
    targets = evidence['deviceTargets']
    roles = [role for t in targets for role in t['roles']]
    require(set(roles) == set(policy['requiredDeviceRoles']) and len(roles) == len(set(roles)), 'device role coverage mismatch')
    require(set(policy['hostNodeVersions']) == {t['nodeVersion'] for t in targets}, 'host versions differ from observed runtimes')
    require(len({t['suiteSha256'] for t in targets}) == 1, 'device suites differ')
    for t in targets:
        require(t['execution'] == 'device' and t['status'] == 'passed', 'missing device evidence')
        require(t['packageSha256'] == evidence['candidateSha256'], 'device candidate mismatch')
        require(len(t['runs']) >= 2 and len({r['pid'] for r in t['runs']}) >= 2 and len({r['runId'] for r in t['runs']}) >= 2, 'distinct cold starts missing')
        for run in t['runs']:
            require(run['status'] == 'passed' and run['total'] > 0 and run['pass'] == run['total'] and run['fail'] == run['notRun'] == 0, 'incomplete historical run')
            require(run['total'] == evidence['requiredCaseCount'] and run['naturalExit']['passed'], 'functional or shutdown acceptance missing')
        require(t['workaroundRequired'] == (t['engineSha256'] != t['originalEngineSha256']), 'runtime prerequisite mismatch')
    require(evidence['release']['status'] in ('ready', 'blocked'), 'unknown release state')
    return lock, evidence, policy


def inventory(tgz):
    files, meta, seen = {}, None, set()
    with tarfile.open(tgz) as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            require(not name.is_absolute() and '..' not in name.parts and '\\' not in member.name and name.parts and name.parts[0] == 'package', 'unsafe npm archive path')
            normalized = name.as_posix()
            require(normalized not in seen and (member.isfile() or member.isdir()), 'duplicate or non-regular archive member')
            seen.add(normalized)
            if member.isfile():
                rel = '/'.join(name.parts[1:])
                require(rel and member.size <= 128 * 1024 * 1024, 'invalid archive member')
                data = archive.extractfile(member).read()
                files[rel] = hashlib.sha256(data).hexdigest()
                if rel == 'package.json':
                    meta = json.loads(data)
                if rel.endswith(('.node', '.so')):
                    require(data[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<HH', data, 16) == (3, 183), 'expected aarch64 ET_DYN: ' + rel)
    require(meta is not None, 'package.json missing')
    return files, meta


def verify_candidate(tgz):
    lock, evidence, policy = check_recipe()
    require(sha(tgz) == evidence['candidateSha256'], 'candidate sha256 mismatch')
    require(hashlib.sha256(gzip.decompress(Path(tgz).read_bytes())).hexdigest() == lock['candidateTarSha256'], 'candidate tar mismatch')
    require('sha512-' + base64.b64encode(hashlib.sha512(Path(tgz).read_bytes()).digest()).decode() == evidence['candidateIntegrity'], 'candidate integrity mismatch')
    files, meta = inventory(tgz)
    require(files == evidence['packageFiles'], 'candidate package files mismatch')
    require((meta['name'], meta['version']) == (policy['packageName'], policy['packageVersion']), 'candidate identity mismatch')
    require(meta['repository'] == {'type': 'git', 'url': 'git+' + policy['repositoryUrl'] + '.git', 'directory': policy['portPath']}, 'candidate repository mismatch')
    with tarfile.open(tgz) as archive:
        receipt = json.load(archive.extractfile('package/native-source.json'))
    source = read(ADAPTER / 'native-source/source-inputs.lock.json')
    require(receipt['sourceLockSha256'] == sha(ADAPTER / 'native-source/source-inputs.lock.json'), 'native source lock differs from checkout')
    require(receipt['nativeSourcePatches'] == source['nativeSourcePatches'], 'native receipt source patches differ')
    require(receipt['compilerSha256'] == source['ndk']['compilerSha256'], 'native compiler differs')
    require(receipt['nativeSourceRebuild'] and not receipt['officialPrebuiltShimLinked'], 'native source receipt incomplete')
    return meta


def verify_bundle(bundle):
    bundle = Path(bundle)
    data = read(bundle / 'bundle.json')
    _, evidence, _ = check_recipe()
    require(data['recipeFiles'] == recipe_files(), 'bundle recipe differs from current checkout')
    require(data['gitCommit'] == git_commit(), 'bundle checkout SHA mismatch')
    require(data['candidateSha256'] == evidence['candidateSha256'], 'bundle candidate mismatch')
    require(data['nativeArchiveSha256'] == read(ADAPTER / 'native-artifact.lock.json')['archiveSha256'], 'bundle native archive mismatch')
    require(sha(bundle / 'candidate.json') == data['candidateManifestSha256'], 'candidate manifest tampered')
    manifest = read(bundle / 'candidate.json')
    require(manifest['sha256'] == evidence['candidateSha256'] and manifest['packageFiles'] == evidence['packageFiles'], 'candidate manifest differs from reviewed evidence')
    verify_candidate(bundle / 'candidate.tgz')
    return data


def require_ready(lock, evidence):
    require(evidence['release']['status'] == 'ready' and not evidence['release']['reasons'], 'release blocked: ' + '; '.join(evidence['release']['reasons']))
    require(lock['nativeSourceRebuild'] and evidence['nativeSourceRebuild'], 'source-native build chain is not complete')
    require(not evidence['acceptanceGaps'], 'declared functional acceptance gaps remain')
    require(evidence['nodeNativeSourceRebuild'], 'Node source-native build chain is not complete')
    source = evidence['sourceEvidence']
    require(source['archiveUrl'] and source['archiveUrl'].startswith('https://') and source['archiveSha256'], 'reviewable remote evidence archive missing')
    native = read(ADAPTER / 'native-artifact.lock.json')
    require(native['archiveUrl'] and native['archiveUrl'].startswith('https://'), 'native archive not hosted')


def publish_context(env, policy):
    require(env.get('ENABLE_ELECTRON_OH_PUBLISH') == '1', 'publishing is disabled by default')
    require(env.get('NAPI_RS_CANVAS_PUBLISH_MODE') == 'oidc', 'npm Trusted Publisher has not been enabled')
    require(env.get('GITHUB_ACTIONS') == 'true' and env.get('GITHUB_REPOSITORY') == policy['repository'], 'wrong CI repository')
    require(env.get('GITHUB_EVENT_NAME') == 'push' and env.get('GITHUB_REF') == 'refs/heads/' + policy['publishBranch'], 'publishing requires a trusted main push')
    expected = policy['repository'] + '/.github/workflows/' + policy['workflow'] + '@refs/heads/' + policy['publishBranch']
    require(env.get('GITHUB_WORKFLOW_REF') == expected, 'wrong workflow identity')
    require(env.get('GITHUB_ENVIRONMENT') == policy['environment'], 'wrong environment')
    require(env.get('GITHUB_SHA') == git_commit(), 'checkout differs from triggering commit')


def verify_evidence_archive(data, evidence):
    source = evidence['sourceEvidence']
    require(hashlib.sha256(data).hexdigest() == source['archiveSha256'], 'source evidence archive mismatch')
    found = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for member in archive:
            p = PurePosixPath(member.name)
            require(not p.is_absolute() and '..' not in p.parts and p.as_posix() == member.name, 'unsafe evidence path')
            require(member.isfile() and member.name in source['archiveFiles'] and member.name not in found, 'unexpected evidence member')
            require(member.size <= 16 * 1024 * 1024, 'evidence member too large')
            body = archive.extractfile(member).read()
            require(hashlib.sha256(body).hexdigest() == source['archiveFiles'][member.name], 'evidence member mismatch')
            found[member.name] = body
    require(set(found) == set(source['archiveFiles']), 'source evidence files missing')
    require(hashlib.sha256(found[source['handoffPath']]).hexdigest() == source['handoffSha256'], 'source handoff mismatch')
    handoff = json.loads(found[source['handoffPath']])
    require(handoff['candidate']['sha256'] == evidence['candidateSha256'], 'source handoff candidate mismatch')
    for target in evidence['deviceTargets']:
        report = json.loads(found[target['reportPath']])
        require(hashlib.sha256(found[target['reportPath']]).hexdigest() == target['reportSha256'], 'device report mismatch')
        require(report['packageSha256'] == evidence['candidateSha256'] and report['status'] == 'passed', 'source device result mismatch')
        require(report['hapSha256'] == target['signedHapSha256'] and report['runtimeExpected']['engineSha256'] == target['engineSha256'], 'source HAP/engine mismatch')
        require(report['suiteSha256'] == target['suiteSha256'] and report['testPlanSha256'] == target['testPlanSha256'], 'source suite or test-plan mismatch')
        require([{k: r[k] for k in target['runs'][0]} for r in report['runs']] == target['runs'], 'source run identities/counts differ')
        for run in report['runs']:
            require(len(run['results']) == run['total'] and all(r['status'] == 'passed' for r in run['results']), 'source assertions incomplete')
            require({r['name'] for r in run['results']} == set(evidence['requiredCases']), 'required assertion names differ')
            require(run['naturalExit']['passed'] and run['worker']['code'] == 0 and not run['worker']['timedOut'], 'source lifecycle incomplete')
            name = 'skia.openharmony-arm64.node' if target['roles'] == ['node'] else 'native/electron/skia.electron-oh-arm64.node'
            require(len(run['nativeLoads']) == 2 and all(n['sha256'] == evidence['packageFiles'][name] for n in run['nativeLoads']), 'source native selection differs')
            if target['roles'] == ['node']:
                require(run['parentObservedExitZero'], 'Node parent did not observe exit zero')


def verify_remote_evidence(evidence):
    url = evidence['sourceEvidence']['archiveUrl']
    require(url and url.startswith('https://'), 'source evidence URL missing')
    with urllib.request.urlopen(url, timeout=90) as response:
        require(response.geturl().startswith('https://'), 'evidence HTTPS downgrade is forbidden')
        data = response.read(64 * 1024 * 1024 + 1)
    require(len(data) <= 64 * 1024 * 1024, 'evidence archive too large')
    verify_evidence_archive(data, evidence)
    return data


def existing_version(policy):
    url = policy['registry'].rstrip('/') + '/' + urllib.parse.quote(policy['packageName'], safe='') + '/' + urllib.parse.quote(policy['packageVersion'], safe='')
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise ValueError('registry request failed with HTTP ' + str(error.code)) from error


def check_existing(meta, expected_integrity):
    if meta is None:
        return 'new-version'
    require(meta.get('dist', {}).get('integrity') == expected_integrity, 'published version has different bytes; refuse overwrite')
    return 'already-published'


def wait_for_publication(policy, expected_integrity, attempts=41, interval=30):
    # npm can accept an upload before its version endpoint becomes visible.
    # Retry only a confirmed 404. Authentication/network errors and different
    # bytes remain failures, and this function never repeats npm publish.
    for attempt in range(attempts):
        meta = existing_version(policy)
        if meta is not None:
            return check_existing(meta, expected_integrity)
        if attempt + 1 < attempts:
            print('npm accepted upload; waiting for registry visibility (' + str(attempt + 1) + '/' + str(attempts) + ')', flush=True)
            time.sleep(interval)
    raise ValueError('npm accepted the upload but registry visibility timed out')


def publish(bundle):
    lock, evidence, policy = check_recipe()
    publish_context(os.environ, policy)
    require_ready(lock, evidence)
    verify_bundle(bundle)
    verify_remote_evidence(evidence)
    # No registry, npm or OIDC interaction occurs before all local guards pass.
    state = check_existing(existing_version(policy), evidence['candidateIntegrity'])
    if state == 'already-published':
        print(state)
        return
    require(os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL') and os.environ.get('ACTIONS_ID_TOKEN_REQUEST_TOKEN'), 'GitHub OIDC unavailable')
    require(subprocess.check_output(['node', '-p', 'process.versions.node'], text=True).strip() == policy['nodeForPublish'], 'wrong publishing Node version')
    require(subprocess.check_output(['npm', '--version'], text=True).strip() == policy['npmForPublish'], 'wrong publishing npm version')
    subprocess.run(['npm', 'publish', str((Path(bundle) / 'candidate.tgz').resolve()), '--access', 'public', '--tag', policy['distTag'], '--provenance', '--registry', policy['registry']], check=True)
    require(wait_for_publication(policy, evidence['candidateIntegrity']) == 'already-published', 'registry integrity verification failed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'verify', 'evidence', 'publish'])
    parser.add_argument('--bundle', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.action == 'check':
        _, evidence, _ = check_recipe()
        print(json.dumps({'recipe': 'passed', 'release': evidence['release']['status'], 'deviceEvidence': 'historical conditional coverage; not a fresh run'}))
    elif args.action == 'evidence':
        require(args.output is not None and not args.output.exists(), 'use a new --output file')
        _, evidence, _ = check_recipe()
        args.output.write_bytes(verify_remote_evidence(evidence))
        print('remote evidence archive and all required device assertions: passed')
    else:
        require(args.bundle is not None, '--bundle is required')
        if args.action == 'verify':
            verify_bundle(args.bundle)
            print('bundle, current recipe and frozen candidate: passed')
        else:
            publish(args.bundle)


if __name__ == '__main__':
    main()
