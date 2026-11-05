from pathlib import Path
import importlib.util,json,os,sys,tempfile,subprocess
from unittest.mock import patch
P=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(P/'electron-oh/tools'))
import release_channel as c
spec=importlib.util.spec_from_file_location('release',P/'electron-oh/tools/release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
def refused(call):
 try:call()
 except (ValueError,FileNotFoundError,subprocess.CalledProcessError):return
 raise AssertionError('Expected publication rejection')
refused(lambda:release.guard({}))
env={'ENABLE_ELECTRON_OH_PUBLISH':'1','GITHUB_REPOSITORY':release.REPO,'GITHUB_EVENT_NAME':'push','GITHUB_REF':'refs/heads/main','GITHUB_ENVIRONMENT':'npm-publish','GITHUB_WORKFLOW_REF':release.REPO+'/'+release.WORKFLOW+'@refs/heads/main'}
release.guard(env)
for key,value in [('GITHUB_EVENT_NAME','pull_request'),('GITHUB_EVENT_NAME','workflow_dispatch'),('GITHUB_REPOSITORY','other/fork'),('GITHUB_REF','refs/heads/feature'),('GITHUB_WORKFLOW_REF','wrong/workflow.yml')]:
 wrong={**env,key:value};refused(lambda:release.guard(wrong))
p=c.resolve_policy(release.NAME,release.VERSION)
lock=release.read(P/'electron-oh/inputs.lock.json');c.check_config(lock,p)
refused(lambda:c.check_config({**lock,'distTag':'electron-oh'},p))
refused(lambda:c.checked_publish(['npm','publish','candidate.tgz','--tag','electron-oh'],[lock],p))
refused(lambda:c.check_tag_write('electron-oh',release.VERSION,p))
refused(lambda:c.check_registry({'name':release.NAME,'dist-tags':{'latest':release.VERSION}},p))
refused(lambda:c.check_catalog([{'name':release.NAME,'electron_oh_version':release.VERSION,'dist_tags':{'latest':release.VERSION}}],p))
with tempfile.TemporaryDirectory() as d:
 refused(lambda:release.verify(Path(d)))
print('open release guard: trusted context, channel argv, old tag, missing beta, old catalog and missing artifact rejected')
