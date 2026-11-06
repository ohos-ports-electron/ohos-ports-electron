"""Publication rejection and actual channel integration checks, not device runs."""
import sys,json,io,hashlib,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import release
class Contract(unittest.TestCase):
 def context(self):return {'ENABLE_ELECTRON_OH_PUBLISH':'1','GITHUB_REPOSITORY':release.REPO,'GITHUB_EVENT_NAME':'push','GITHUB_REF':'refs/heads/main','GITHUB_ENVIRONMENT':'npm-publish','GITHUB_WORKFLOW_REF':release.REPO+'/'+release.WORKFLOW+'@refs/heads/main'}
 def test_trusted_main(self):release.guard(self.context())
 def test_disabled(self):
  env=self.context();env.pop('ENABLE_ELECTRON_OH_PUBLISH')
  with self.assertRaisesRegex(ValueError,'disabled'):release.guard(env)
 def test_pr_fork_branch_workflow_environment(self):
  for k,v in [('GITHUB_EVENT_NAME','pull_request'),('GITHUB_EVENT_NAME','workflow_dispatch'),('GITHUB_REPOSITORY','fork/repo'),('GITHUB_REF','refs/heads/topic'),('GITHUB_ENVIRONMENT','other'),('GITHUB_WORKFLOW_REF','other.yml')]:
   with self.subTest(k=k,v=v),self.assertRaises(ValueError):release.guard({**self.context(),k:v})
 def test_404_only_means_missing(self):
  for code in [404,401,403,429,500]:
   with patch.object(release.urllib.request,'urlopen',side_effect=urllib.error.HTTPError('https://example.test',code,'error',{},None)):
    if code==404:self.assertIsNone(release.get('https://example.test'))
    else:
     with self.assertRaises(urllib.error.HTTPError):release.get('https://example.test')
 def test_missing_artifact(self):
  with self.assertRaises(FileNotFoundError):release.verify(Path('/nonexistent/rxjs-artifact'))
 def test_legacy_configuration_before_upload(self):
  old={'candidate':{'name':release.NAME,'version':release.VERSION},'distTag':'electron-oh','requiredDistTags':['latest','electron-oh'],'channelSource':'explicit user override'}
  with patch.object(release,'read',return_value=old),patch.object(release.subprocess,'run') as run:
   with self.assertRaises(ValueError):release.verify(Path('/synthetic'))
   run.assert_not_called()
 def test_legacy_write_rejected_before_authentication(self):
  with patch.object(release,'guard'),patch.object(release.urllib.request,'urlopen') as opened:
   with self.assertRaises(ValueError):release.oidc_tag('electron-oh')
   opened.assert_not_called()
 def test_missing_beta_fails_same_byte_acceptance(self):
  root=json.dumps({'dist-tags':{'latest':release.VERSION,'electron-oh':release.VERSION}}).encode()
  with patch.object(release,'get',return_value=root):
   with self.assertRaises(ValueError):release.wait_for_tags(attempts=1)
 def test_historic_legacy_tags_are_preserved(self):
  root={'latest':release.VERSION,'beta':release.VERSION,'electron-oh':'0.1.0-old'}
  with patch.object(release,'get',return_value=json.dumps({'dist-tags':root}).encode()):self.assertEqual(release.wait_for_tags(attempts=1),root)
 def test_oidc_never_falls_back(self):
  env={**self.context(),'ACTIONS_ID_TOKEN_REQUEST_URL':'https://example.test/identity','ACTIONS_ID_TOKEN_REQUEST_TOKEN':'synthetic'}
  class Response(io.BytesIO):status=200
  with patch.dict(release.os.environ,env,clear=True),patch.object(release.urllib.request,'urlopen',side_effect=[Response(b'{"value":"synthetic"}'),urllib.error.HTTPError('https://example.test',403,'denied',{},None)]) as opened:
   with self.assertRaises(urllib.error.HTTPError):release.oidc_tags(['latest'])
   self.assertEqual(opened.call_count,2)
 def test_new_upload_uses_checked_frozen_tgz_command(self):
  raw=b'frozen';manifest={'sha256':hashlib.sha256(raw).hexdigest(),'integrity':'locked'};current={'dist':{'integrity':'locked','tarball':'https://example.test/tarball'}}
  package={'dist-tags':{'latest':release.VERSION,'beta':release.VERSION}}
  with patch.object(release,'guard'),patch.object(release,'verify',return_value=manifest),patch.object(release,'metadata',side_effect=[None,current]),patch.object(release,'published_bytes',return_value=raw),patch.object(release,'get',return_value=json.dumps(package).encode()),patch.object(release,'oidc_tags'),patch.object(release.subprocess,'run') as upload:
   release.publish(Path('/synthetic'))
  command=upload.call_args.args[0];self.assertIn('run-publish',command);self.assertIn('release_channel.py',command[1]);self.assertIn('/synthetic/candidate.tgz',command);self.assertEqual(command[command.index('--tag')+1],'beta')
 def test_existing_bytes_still_verify_tags(self):
  raw=b'frozen';manifest={'sha256':hashlib.sha256(raw).hexdigest(),'integrity':'locked'};current={'dist':{'integrity':'locked','tarball':'https://example.test/tarball'}}
  with patch.object(release,'guard'),patch.object(release,'verify',return_value=manifest),patch.object(release,'metadata',return_value=current),patch.object(release,'published_bytes',return_value=raw),patch.object(release,'get',return_value=json.dumps({'dist-tags':{'latest':release.VERSION}}).encode()),patch.object(release,'oidc_tags') as tags,patch.object(release,'wait_for_tags',return_value={'latest':release.VERSION,'beta':release.VERSION}),patch.object(release.subprocess,'run') as upload:
   release.publish(Path('/synthetic'))
  upload.assert_not_called();tags.assert_called_once_with(['latest','beta'])
 def test_only_real_npm_staging_placeholder_can_advance(self):
  raw=b'frozen';manifest={'sha256':hashlib.sha256(raw).hexdigest(),'integrity':'locked'};current={'dist':{'integrity':'locked','tarball':'https://example.test/tarball'}}
  for valid in [True,False]:
   package={'dist-tags':{'latest':'0.0.0-stage','beta':release.VERSION},'versions':{'0.0.0-stage':{'name':release.NAME,'version':'0.0.0-stage','stub':valid}}}
   with patch.object(release,'guard'),patch.object(release,'verify',return_value=manifest),patch.object(release,'metadata',return_value=current),patch.object(release,'published_bytes',return_value=raw),patch.object(release,'get',return_value=json.dumps(package).encode()),patch.object(release,'oidc_tags') as tags,patch.object(release,'wait_for_tags',return_value={'latest':release.VERSION,'beta':release.VERSION}):
    if valid:release.publish(Path('/synthetic'));tags.assert_called_once_with(['latest','beta'])
    else:
     with self.assertRaisesRegex(ValueError,'refusing automatic rollback'):release.publish(Path('/synthetic'))
     tags.assert_not_called()
if __name__=='__main__':unittest.main()
