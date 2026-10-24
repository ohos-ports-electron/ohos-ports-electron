#pragma once
#include <string>
#include <vector>
#include <cstdlib>
inline std::vector<std::string> ohpt_node_args(std::vector<std::string> tail){std::vector<std::string> args={"--jitless","--expose-gc"};args.insert(args.end(),tail.begin(),tail.end());return args;}
inline void ohpt_node_env(const std::string& bin_dir){setenv("LD_LIBRARY_PATH", (std::string("") + bin_dir + "").c_str(), 1);
setenv("LD_PRELOAD", (std::string("") + bin_dir + "/libsyscall_fallback.so").c_str(), 1);}
