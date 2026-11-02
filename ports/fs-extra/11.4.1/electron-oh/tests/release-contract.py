#!/usr/bin/env python3
"""Synthetic rejection checks for publication controls; not device evidence."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

path=Path(__file__).resolve().parents[1]/'tools/release.py'
spec=importlib.util.spec_from_file_location('fs_extra_release',path)
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
  with self.assertRaises(FileNotFoundError):release.verify(Path('/nonexistent/fs-extra-build'))
if __name__=='__main__':unittest.main()
