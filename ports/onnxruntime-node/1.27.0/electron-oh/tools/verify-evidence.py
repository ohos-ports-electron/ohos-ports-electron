#!/usr/bin/env python3
"""Verify shared complete reports against reviewed hashes before publication."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
import urllib.request

ADAPTER = Path(__file__).resolve().parent.parent


def require(value, reason):
    if not value:
        raise ValueError(reason)


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4194304), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Explicit local archive; no hosting claim')
    args = parser.parse_args()
    evidence = json.loads((ADAPTER / 'release-evidence.json').read_text())
    source = evidence['sourceEvidence']
    with tempfile.TemporaryDirectory(prefix='onnx-device-evidence-') as temp:
        archive = Path(temp) / 'evidence.tar.gz'
        if args.archive:
            shutil.copyfile(args.archive, archive)
        else:
            url = source.get('archiveUrl')
            require(source['reportsArchived'] and url and url.startswith('https://'), 'Evidence is not hosted')
            with urllib.request.urlopen(url, timeout=120) as response, archive.open('wb') as stream:
                shutil.copyfileobj(response, stream, 4194304)
        require(sha(archive) == source['archiveSha256'], 'Evidence archive checksum mismatch')
        members = {}
        with tarfile.open(archive) as content:
            for entry in content:
                require(entry.isfile() and entry.name not in members and
                        not entry.name.startswith('/') and '..' not in Path(entry.name).parts and
                        entry.size <= 32 * 1024 * 1024, 'Unexpected evidence archive member')
                members[entry.name] = content.extractfile(entry).read()
        index = json.loads(members['index.json'])
        require(index['candidateSha256'] == evidence['candidateSha256'], 'Evidence candidate mismatch')
        for name, item in index['files'].items():
            require(hashlib.sha256(members[name]).hexdigest() == item['sha256'], 'Evidence member mismatch: ' + name)
        cases = 0
        for target in evidence['deviceTargets']:
            name = 'primary/' + target['runtimeId'] + '.json'
            require(index['files'][name]['sourceSha256'] == target['reportSha256'], 'Primary source hash mismatch')
            report = json.loads(members[name])
            require(report['status'] == 'passed' and report['execution'] == 'device', 'Primary device report failed')
            require(report['packageSha256'] == evidence['candidateSha256'], 'Primary candidate mismatch')
            require(len(report['runs']) >= 2 and len({r['pid'] for r in report['runs']}) >= 2, 'Primary cold starts missing')
            for run in report['runs']:
                require(run['pass'] == 20 and run['fail'] == 0 and len(run['results']) == 20, 'Incomplete primary cases')
                require(all(case['status'] == 'passed' and case.get('name') for case in run['results']), 'Primary case status missing')
                if target.get('uiEvidencePresent'):
                    require(all(case.get('actual') and case.get('expected') for case in run['results']), 'Primary UI per-case values missing')
                cases += 20
        lifecycle = evidence['releasePrerequisites']['targetNpmLifecycle']
        require(lifecycle['status'] == 'passed' and len(lifecycle['reports']) == 5, 'Five npm reports required')
        for compact in lifecycle['reports']:
            name = compact['publicReportPath']
            require(index['files'][name]['sourceSha256'] == compact['reportSha256'] and
                    index['files'][name]['sha256'] == compact['publicReportSha256'], 'npm report binding mismatch')
            report = json.loads(members[name])
            require(report['status'] == 'passed' and report['execution'] == 'device' and
                    report['packageSha256'] == evidence['candidateSha256'], 'npm report identity/status mismatch')
            require(len(report['runs']) == len(report['installations']) == 2 and
                    len({r['pid'] for r in report['runs']}) == 2, 'npm cold starts missing')
            target = next(t for t in evidence['deviceTargets'] if t['runtimeId'] == compact['runtimeId'])
            for run, installation in zip(report['runs'], report['installations']):
                require(run['versions']['node'] == target['nodeVersion'] and run['versions'].get('electron') == target['electronVersion'], 'Consumer runtime mismatch')
                require(run['pass'] == run['expectedTotal'] == len(run['results']) == 20 and run['fail'] == 0, 'npm consumer cases incomplete')
                require(all(c['status'] == 'passed' and c.get('expected') and c.get('actual') for c in run['results']), 'npm per-case evidence missing')
                require(run['npmLifecycle']['runId'] == installation['runId'], 'Install/consumer run binding mismatch')
                require(installation['status'] == 'passed' and installation['nodeModulesInitiallyAbsent'] and
                        installation['postinstallExecuted'] and installation['tgzSha256'] == evidence['candidateSha256'], 'npm installation incomplete')
                require({f['name']: f['actual'] for f in installation['fileChecks']} == evidence['packageFiles'] and
                        len(installation['fileChecks']) == 72 and all(f['matched'] for f in installation['fileChecks']), 'Installed package inventory differs')
                require(all(c['exitCode'] == 0 for c in installation['commands']), 'Installer command failed')
                command = installation['commands'][-1]
                require('ci' in command['argv'] and '--ignore-scripts' not in command['argv'] and
                        '> node ./script/ohos-install.cjs' in command['stdout'], 'Actual npm postinstall transcript missing')
                cases += 20
        print(json.dumps({'status': 'passed', 'source': 'local-archive' if args.archive else 'https-archive',
                          'primaryDeviceTargets': 5, 'npmDeviceTargets': 5, 'verifiedPerCaseResults': cases,
                          'archiveSha256': source['archiveSha256']}))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, tarfile.TarError) as error:
        raise SystemExit(str(error))
