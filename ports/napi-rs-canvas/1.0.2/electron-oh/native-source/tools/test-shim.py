#!/usr/bin/env python3
"""Run the actual source shim on the host against controlled provider libraries.
SPDX-License-Identifier: MIT. These are forwarding tests, not OHOS Canvas tests.
"""
import argparse,json,os,subprocess,resource
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
root=Path(__file__).resolve().parents[1];include=root/'shim/include/electron_node/src';shim=root/'shim/canvas_electron_shim.c'
def run(cmd,**kw):return subprocess.run(cmd,check=True,**kw)
(out/'engine.c').write_text('''#include "node_api.h"
#include <stdint.h>
napi_status napi_get_undefined(napi_env env,napi_value *value) { *value=(napi_value)((uintptr_t)env+17); return napi_ok; }
''')
(out/'driver.c').write_text('''#define HIDE_NAPI_AND_UV 1
#include "node_api.h"
#include <pthread.h>
#include <stdint.h>
#include <stdlib.h>
static void *work(void *id) {
 for(int i=0;i<10000;i++) { napi_value value=0; uintptr_t e=(uintptr_t)id*100000+i;
  if(napi_get_undefined((napi_env)e,&value)!=napi_ok || (uintptr_t)value!=e+17) abort(); }
 return 0;
}
int main(int argc,char **argv) {
 if(argc>1) { napi_value value=0; napi_get_null((napi_env)1,&value); return 3; }
 pthread_t workers[8]; for(uintptr_t i=0;i<8;i++) if(pthread_create(&workers[i],0,work,(void*)(i+1))) return 4;
 for(int i=0;i<8;i++) if(pthread_join(workers[i],0)) return 5; return 0;
}
''')
run(['clang','-std=c11','-O2','-fPIC','-I'+str(include),'-c',str(shim),'-o',str(out/'shim.o')])
run(['clang','-dynamiclib','-I'+str(include),str(out/'engine.c'),'-o',str(out/'libelectron.so')])
run(['clang','-std=c11','-I'+str(include),str(out/'driver.c'),str(out/'shim.o'),'-lpthread','-o',str(out/'driver')])
env={**os.environ,'DYLD_LIBRARY_PATH':str(out)}
def no_core():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
passed=subprocess.run([str(out/'driver')],env=env,capture_output=True,text=True);assert passed.returncode==0,passed.stderr
missing=subprocess.run([str(out/'driver'),'missing'],env=env,capture_output=True,text=True,preexec_fn=no_core);assert missing.returncode!=0 and 'required Electron symbol missing: napi_get_null' in missing.stderr
(out/'foreign.c').write_text('#include "node_api.h"\nnapi_status napi_get_null(napi_env env,napi_value *v){return napi_ok;}\n')
(out/'foreign-engine.c').write_text('#include "node_api.h"\nvoid *force_foreign_dependency=(void*)napi_get_null;\n')
run(['clang','-dynamiclib','-I'+str(include),str(out/'foreign.c'),'-Wl,-install_name,'+str(out/'libforeign.so'),'-o',str(out/'libforeign.so')])
run(['clang','-dynamiclib','-I'+str(include),str(out/'foreign-engine.c'),str(out/'libforeign.so'),'-o',str(out/'libelectron.so')])
foreign=subprocess.run([str(out/'driver'),'foreign'],env=env,capture_output=True,text=True,preexec_fn=no_core);assert foreign.returncode!=0 and 'refusing non-Electron provider' in foreign.stderr
report={'status':'passed','scope':'actual generated C shim; host controlled providers, not device Canvas','checks':['8 threads / 80000 forwarded calls preserve each env pointer','missing API rejected','dependency provider rejected'],'missingStderr':missing.stderr,'foreignStderr':foreign.stderr}
(out/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
