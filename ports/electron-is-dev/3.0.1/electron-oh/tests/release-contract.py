#!/usr/bin/env python3
"""Synthetic rejection checks for publication controls; not device evidence."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error
import hashlib
import json
import io
import contextlib

path=Path(__file__).resolve().parents[1]/'tools/release.py'
spec=importlib.util.spec_from_file_location('electron_is_dev_release',path)
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class PublicationContract(unittest.TestCase):
 def context(self):return {'ENABLE_ELECTRON_OH_PUBLISH':'1','GITHUB_REPOSITORY':release.REPO,'GITHUB_EVENT_NAME':'push','GITHUB_REF':'refs/heads/main','GITHUB_ENVIRONMENT':'npm-publish','GITHUB_WORKFLOW_REF':release.REPO+'/'+release.WORKFLOW+'@refs/heads/main'}
 def test_exact_trusted_main_context(self):release.guard(self.context())
 def test_publish_disabled_by_default(self):
  env=self.context();env.pop('ENABLE_ELECTRON_OH_PUBLISH')
  with self.assertRaisesRegex(ValueError,'disabled'):release.guard(env)
 def test_pr_fork_branch_workflow_and_environment_are_rejected(self):
  for field,value in [('GITHUB_EVENT_NAME','pull_request'),('GITHUB_REPOSITORY','fork/repo'),('GITHUB_REF','refs/heads/topic'),('GITHUB_ENVIRONMENT','other'),('GITHUB_WORKFLOW_REF',release.REPO+'/other.yml@refs/heads/main')]:
   with self.subTest(field=field):
    env=self.context();env[field]=value
    with self.assertRaisesRegex(ValueError,'untrusted'):release.guard(env)
 def test_registry_404_is_missing(self):
  with patch.object(release.urllib.request,'urlopen',side_effect=urllib.error.HTTPError('https://example.test',404,'missing',{},None)):
   self.assertIsNone(release.get('https://example.test'))
 def test_registry_auth_and_server_errors_are_not_missing(self):
  for code in [401,403,429,500]:
   with self.subTest(code=code),patch.object(release.urllib.request,'urlopen',side_effect=urllib.error.HTTPError('https://example.test',code,'failure',{},None)):
    with self.assertRaises(urllib.error.HTTPError):release.get('https://example.test')
 def test_missing_artifact_is_rejected(self):
  with self.assertRaises(FileNotFoundError):release.verify(Path('/nonexistent/electron-is-dev-build'))
 def test_tarball_404_propagation_is_retried_without_changing_version(self):
  with patch.object(release,'get',side_effect=[None,b'frozen']),patch.object(release.time,'sleep') as sleep:
   self.assertEqual(release.published_bytes('https://example.test',attempts=2),b'frozen');sleep.assert_called_once_with(15)
 def test_tarball_visibility_timeout_is_distinct_from_byte_mismatch(self):
  with patch.object(release,'get',return_value=None):
   with self.assertRaisesRegex(ValueError,'still processing'):release.published_bytes('https://example.test',attempts=1)
 def test_existing_bytes_still_exercise_both_dist_tag_permissions(self):
  raw=b'frozen';manifest={'sha256':hashlib.sha256(raw).hexdigest(),'integrity':'locked'}
  current={'dist':{'integrity':'locked','tarball':'https://example.test/tarball'}}
  root=json.dumps({'dist-tags':{'latest':release.VERSION,'beta':release.VERSION}}).encode()
  with patch.object(release,'guard'),patch.object(release,'verify',return_value=manifest),patch.object(release,'metadata',return_value=current),patch.object(release,'published_bytes',return_value=raw),patch.object(release,'get',return_value=root),patch.object(release,'oidc_tags') as tags,patch.object(release.subprocess,'run') as run:
   release.publish(Path('/synthetic'))
  run.assert_not_called();tags.assert_called_once_with(['latest','beta'])
 def test_oidc_tag_write_uses_exchanged_identity_without_logging_credentials(self):
  class Response(io.BytesIO):status=200
  responses=[]
  for tag in ['latest','beta']:
   responses.extend([Response(json.dumps({'value':'synthetic-identity-'+tag}).encode()),Response(json.dumps({'token':'synthetic-token-'+tag}).encode()),Response(b'{}')])
  env={**self.context(),'ACTIONS_ID_TOKEN_REQUEST_URL':'https://example.test/token?x=1','ACTIONS_ID_TOKEN_REQUEST_TOKEN':'synthetic-request'}
  output=io.StringIO()
  with patch.dict(release.os.environ,env,clear=True),patch.object(release.urllib.request,'urlopen',side_effect=responses) as opened,contextlib.redirect_stdout(output):release.oidc_tags(['latest','beta'])
  requests=[call.args[0] for call in opened.call_args_list]
  self.assertEqual([r.get_method() for r in requests],['GET','POST','PUT','GET','POST','PUT'])
  self.assertIn('audience=npm%3Aregistry.npmjs.org',requests[0].full_url)
  self.assertEqual(requests[2].get_header('Authorization'),'Bearer synthetic-token-latest')
  self.assertEqual(requests[5].get_header('Authorization'),'Bearer synthetic-token-beta')
  self.assertTrue(all(json.loads(requests[i].data)==release.VERSION for i in [2,5]))
  self.assertNotIn('synthetic-',output.getvalue())
 def test_oidc_exchange_failure_cannot_fall_back_to_another_credential(self):
  env={**self.context(),'ACTIONS_ID_TOKEN_REQUEST_URL':'https://example.test/token','ACTIONS_ID_TOKEN_REQUEST_TOKEN':'synthetic-request'}
  class Response(io.BytesIO):status=200
  denied=urllib.error.HTTPError('https://example.test',403,'denied',{},None)
  with patch.dict(release.os.environ,env,clear=True),patch.object(release.urllib.request,'urlopen',side_effect=[Response(b'{"value":"synthetic-identity"}'),denied]) as opened:
   with self.assertRaises(urllib.error.HTTPError):release.oidc_tags(['latest'])
  self.assertEqual(opened.call_count,2)
 def test_oidc_tags_require_live_github_identity(self):
  with patch.dict(release.os.environ,self.context(),clear=True),patch.object(release.urllib.request,'urlopen') as opened:
   with self.assertRaisesRegex(ValueError,'identity missing'):release.oidc_tags(['latest'])
  opened.assert_not_called()
 def test_legacy_tag_is_removed_only_after_verified_beta_writes(self):
  raw=b'frozen';manifest={'sha256':hashlib.sha256(raw).hexdigest(),'integrity':'locked'}
  current={'dist':{'integrity':'locked','tarball':'https://example.test/tarball'}}
  legacy=json.dumps({'dist-tags':{'latest':release.VERSION,'electron-oh':release.VERSION}}).encode()
  migrated=json.dumps({'dist-tags':{'latest':release.VERSION,'beta':release.VERSION}}).encode()
  with patch.object(release,'guard'),patch.object(release,'verify',return_value=manifest),patch.object(release,'metadata',return_value=current),patch.object(release,'published_bytes',return_value=raw),patch.object(release,'get',side_effect=[legacy,legacy,migrated]),patch.object(release,'oidc_tags') as tags,patch.object(release,'oidc_tag') as remove,patch.object(release.time,'sleep') as sleep,patch.object(release.subprocess,'run') as upload:
   release.publish(Path('/synthetic'))
  tags.assert_called_once_with(['latest','beta']);remove.assert_called_once_with('electron-oh',method='DELETE')
  sleep.assert_called_once_with(10);upload.assert_not_called()
 def test_another_legacy_release_is_preserved_without_any_tag_writes(self):
  raw=b'frozen';manifest={'sha256':hashlib.sha256(raw).hexdigest(),'integrity':'locked'}
  current={'dist':{'integrity':'locked','tarball':'https://example.test/tarball'}}
  root=json.dumps({'dist-tags':{'latest':release.VERSION,'electron-oh':'9.9.9-other'}}).encode()
  with patch.object(release,'guard'),patch.object(release,'verify',return_value=manifest),patch.object(release,'metadata',return_value=current),patch.object(release,'published_bytes',return_value=raw),patch.object(release,'get',return_value=root),patch.object(release,'oidc_tags') as tags,patch.object(release,'oidc_tag') as remove:
   with self.assertRaisesRegex(ValueError,'legacy tag points to another release'):release.publish(Path('/synthetic'))
  tags.assert_not_called();remove.assert_not_called()
 def test_legacy_delete_exchanges_a_fresh_identity_and_sends_no_payload(self):
  class Response(io.BytesIO):status=200
  responses=[Response(b'{"value":"synthetic-delete-identity"}'),Response(b'{"token":"synthetic-delete-token"}'),Response(b'{}')]
  env={**self.context(),'ACTIONS_ID_TOKEN_REQUEST_URL':'https://example.test/token','ACTIONS_ID_TOKEN_REQUEST_TOKEN':'synthetic-request'}
  output=io.StringIO()
  with patch.dict(release.os.environ,env,clear=True),patch.object(release.urllib.request,'urlopen',side_effect=responses) as opened,contextlib.redirect_stdout(output):release.oidc_tag('electron-oh',method='DELETE')
  requests=[call.args[0] for call in opened.call_args_list]
  self.assertEqual([r.get_method() for r in requests],['GET','POST','DELETE'])
  self.assertTrue(requests[2].full_url.endswith('/dist-tags/electron-oh'));self.assertIsNone(requests[2].data)
  self.assertEqual(requests[2].get_header('Authorization'),'Bearer synthetic-delete-token')
  self.assertNotIn('synthetic-',output.getvalue())
 def test_publishing_cannot_recreate_legacy_tag_or_delete_beta(self):
  for tag,method in [('electron-oh','PUT'),('beta','DELETE'),('latest','DELETE')]:
   with self.subTest(tag=tag,method=method),patch.object(release,'guard'),patch.object(release.urllib.request,'urlopen') as opened:
    with self.assertRaisesRegex(ValueError,'unexpected distribution tag operation'):release.oidc_tag(tag,method=method)
   opened.assert_not_called()
 def test_new_upload_explicitly_selects_beta_for_the_frozen_candidate(self):
  raw=b'frozen';manifest={'sha256':hashlib.sha256(raw).hexdigest(),'integrity':'locked'}
  current={'dist':{'integrity':'locked','tarball':'https://example.test/tarball'}}
  root=json.dumps({'dist-tags':{'latest':release.VERSION,'beta':release.VERSION}}).encode()
  with patch.object(release,'guard'),patch.object(release,'verify',return_value=manifest),patch.object(release,'metadata',side_effect=[None,current]),patch.object(release,'published_bytes',return_value=raw),patch.object(release,'get',return_value=root),patch.object(release,'oidc_tags'),patch.object(release.subprocess,'run') as upload:
   release.publish(Path('/synthetic'))
  command=upload.call_args.args[0];self.assertEqual(command[command.index('--tag')+1],'beta')
if __name__=='__main__':unittest.main()
