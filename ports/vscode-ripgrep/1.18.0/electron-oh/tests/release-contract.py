from pathlib import Path
import importlib.util,json,tempfile,shutil,sys,contextlib,io
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
print('Release contract: trusted main only; old channel config/upload/tag write rejected; same-byte package without beta fails')
