from pathlib import Path
import importlib.util,json,tempfile,shutil,sys,contextlib,io
from unittest.mock import patch
T=Path(__file__).resolve().parents[1]/'tools';sys.path.insert(0,str(T));spec=importlib.util.spec_from_file_location('port_release',T/'release.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def rejected(fn):
 try:fn()
 except (ValueError,AssertionError):return
 raise AssertionError('unsafe action was accepted')
valid={'ENABLE_ELECTRON_OH_PUBLISH':'1','GITHUB_REPOSITORY':m.REPO,'GITHUB_EVENT_NAME':'push','GITHUB_REF':'refs/heads/main','GITHUB_ENVIRONMENT':'npm-publish','GITHUB_WORKFLOW_REF':m.REPO+'/'+m.WORKFLOW+'@refs/heads/main'}
m.guard(valid)
for key in valid:
 changed={**valid,key:'untrusted'};rejected(lambda:m.guard(changed))
root=T.parents[1];lock=json.loads((root/'electron-oh/inputs.lock.json').read_text());m.channel.check_config(lock,m.POLICY)
rejected(lambda:m.channel.check_config({**lock,'distTag':'electron-oh'},m.POLICY))
rejected(lambda:m.channel.check_publish_command(['npm','publish','candidate.tgz','--tag','electron-oh'],m.POLICY))
rejected(lambda:m.channel.check_tag_write('electron-oh',m.VERSION,m.POLICY))
rejected(lambda:m.channel.check_registry({'name':m.NAME,'dist-tags':{'latest':m.VERSION}},m.POLICY))
m.check_existing_tag('0.0.0-stage',lock)
rejected(lambda:m.check_existing_tag('9.9.9',lock))
rejected(lambda:m.check_existing_tag('0.0.0-stage',{**lock,'bootstrap':{}}))
with patch.object(m,'verify',return_value={'integrity':'sha512-unrelated','files':{}}), patch.object(m.subprocess,'run') as installer:
 rejected(lambda:m.host(Path('/nonexistent-validation-bundle')))
 installer.assert_not_called()
class Response(io.BytesIO):status=200
responses=[]
for tag in ['latest','beta']:
 responses.extend([Response(json.dumps({'value':'synthetic-identity-'+tag}).encode()),Response(json.dumps({'token':'synthetic-token-'+tag}).encode()),Response(b'{}')])
env={**valid,'ACTIONS_ID_TOKEN_REQUEST_URL':'https://example.test/token?x=1&audience=untrusted','ACTIONS_ID_TOKEN_REQUEST_TOKEN':'synthetic-request'}
output=io.StringIO()
with patch.dict(m.os.environ,env,clear=True),patch.object(m.urllib.request,'urlopen',side_effect=responses) as opened,contextlib.redirect_stdout(output):m.oidc_tags(['latest','beta'])
requests=[call.args[0] for call in opened.call_args_list]
assert [r.get_method() for r in requests]==['GET','POST','PUT','GET','POST','PUT']
assert 'audience=npm%3Aregistry.npmjs.org' in requests[0].full_url and 'untrusted' not in requests[0].full_url
assert requests[2].get_header('Authorization')=='Bearer synthetic-token-latest'
assert requests[5].get_header('Authorization')=='Bearer synthetic-token-beta'
assert all(json.loads(requests[i].data)==m.VERSION for i in [2,5])
assert 'synthetic-' not in output.getvalue()
with patch.dict(m.os.environ,valid,clear=True),patch.object(m.urllib.request,'urlopen') as opened:
 rejected(lambda:m.oidc_tags(['electron-oh']));opened.assert_not_called()
 rejected(lambda:m.oidc_tags(['latest']));opened.assert_not_called()
denied=m.urllib.error.HTTPError('https://example.test',403,'denied',{},None)
with patch.dict(m.os.environ,env,clear=True),patch.object(m.urllib.request,'urlopen',side_effect=[Response(b'{"value":"synthetic-identity"}'),denied]) as opened:
 try:m.oidc_tags(['latest'])
 except m.urllib.error.HTTPError:pass
 else:raise AssertionError('OIDC rejection must propagate without credential fallback')
 assert opened.call_count==2
print('Release contract: trusted main only; old channel rejected; real tag PUT flow requires exchanged identity and never logs credentials')
