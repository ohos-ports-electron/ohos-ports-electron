#include "node-launch.h"
// entry/src/main/cpp/napi_stub.cpp — cli-hnp-runner：**私有 HNP 执行器**。
//
// 作用：在零售/不可调试机（uid2000、无 DevBox/公共 HNP）上真实 exec 你交叉编译出的 CLI 二进制，
// 跑用例、出 TAP、把原始输出经 hilog 回传到宿主——这是这类设备上**唯一**已实证的设备侧 exec 通道。
//
// 线程模型：NAPI 暴露 runTool（启动即返回，后台 worker 线程跑全套）+ pollStatus（轮询取结果）
// 两个入口——长测试套跑在 worker 线程，不占 ArkUI 主线程（主线程长阻塞会冻屏，7zip 案例
// 397 秒全套已实证此模型）。TAP 行每判一条即 hlog 一条（实时进度 + hilog 缓冲友好）。
//
// 平台依据（pc-knowledge-base platform/鸿蒙PC-app域执行二进制与JIT限制.md）：
//   私有 HNP（module.json5 hnpPackages type=private）落地标签 private_hnp_file:s0，
//   app 域原生模块 fork()+execv()（**不经 /bin/sh**）可直接 exec C/C++ ELF。
//   nmap（2026-06-26）与 mkspiffs（2026-08-26，7/7 用例）两案真机实证。
//
// 为什么不用 hdc shell 直呼：零售机上 hdc shell 域与 HiShell app 域对 data_local_tmp/hmdfs 标签的
//   用户二进制 exec 全拒（126/127）——连系统 toybox 的物理拷贝也照样被拒，证明拦截来自文件
//   SELinux 标签归属，与 ELF 签名正确与否无关。别在那条路上试错。
//
// ===== 适配你的库时只改一处：kCases 用例表 + ohpt_custom_case 富用例体 =====
// （`scaffold --test-cases` 会按 05-testcases.json 自动生成表行与分发骨架，接线者只填执行体）
// 其余（worker 线程执行器、串行队列、fork+execv、TAP 汇总、hilog 回传、沙箱工作目录管理）是
// 已实证的通用骨架，照用即可。全套用例跑在 **C++ worker 线程**上（不占 ArkUI 主线程——长测试套
// 跑在主线程会冻屏，被系统判无响应/ANR 弹窗，7zip 26.03 三用例真机实证 2026-09-10），
// ArkTS 侧 runCase 入队 + pollStatus() 轮询取结果。
#include <napi/native_api.h>
#include <hilog/log.h>
#include "ohpt_artifacts.h"  // 用例产物通道：执行器登记用例写下的文件（见头注释），接线方零协议
#include <string>
#include <vector>
#include <cstdio>   // dprintf（exec 失败时把 errno 写进 pipe）
#include <cstring>
#include <cerrno>
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>
#include <cstdlib>   // setenv（依赖 .so 的 LD_LIBRARY_PATH 解析）
#include <sys/stat.h>
#include <dirent.h>
#include <limits.h>
#include <fstream>
#include <sstream>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <tuple>
#include <cctype>

#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x0001
#define LOG_TAG "ohportsdeviceidnoderun"

namespace {

void hlog(const std::string& line) {
  OH_LOG_Print(LOG_APP, LOG_INFO, LOG_DOMAIN, LOG_TAG, "%{public}s", line.c_str());
}

/** 递归删除（不用 system()——app 域 exec /bin/sh 的行为不确定，全程绕开 shell） */
int rm_rf(const std::string& path) {
  struct stat st;
  if (lstat(path.c_str(), &st) != 0) return 0;
  if (S_ISDIR(st.st_mode)) {
    DIR* d = opendir(path.c_str());
    if (!d) return -1;
    struct dirent* e;
    while ((e = readdir(d)) != nullptr) {
      std::string name = e->d_name;
      if (name == "." || name == "..") continue;
      rm_rf(path + "/" + name);
    }
    closedir(d);
    return rmdir(path.c_str());
  }
  return unlink(path.c_str());
}

int mkdir_p(const std::string& path) {
  std::string cur;
  size_t i = 0;
  if (!path.empty() && path[0] == '/') { cur = "/"; i = 1; }
  while (i <= path.size()) {
    size_t slash = path.find('/', i);
    std::string seg = (slash == std::string::npos) ? path.substr(i) : path.substr(i, slash - i);
    i = (slash == std::string::npos) ? path.size() + 1 : slash + 1;
    if (seg.empty() || seg == ".") continue;
    if (!cur.empty() && cur.back() != '/') cur += '/';
    cur += seg;
    if (mkdir(cur.c_str(), 0755) != 0 && errno != EEXIST) return -1;
  }
  return 0;
}

void write_file(const std::string& path, const std::string& content) {
  std::ofstream f(path, std::ios::binary | std::ios::trunc);
  f.write(content.data(), static_cast<std::streamsize>(content.size()));
}

bool file_equal(const std::string& a, const std::string& b) {
  std::ifstream fa(a, std::ios::binary), fb(b, std::ios::binary);
  if (!fa || !fb) return false;
  return std::string((std::istreambuf_iterator<char>(fa)), std::istreambuf_iterator<char>()) ==
         std::string((std::istreambuf_iterator<char>(fb)), std::istreambuf_iterator<char>());
}

bool contains(const std::string& haystack, const std::string& needle) {
  return haystack.find(needle) != std::string::npos;
}

/**
 * app 域 fork+execv 子进程会继承 NAPI 宿主进程的信号处置（宿主对 SIGINT 设 SIG_IGN），
 * execv 后仍保持忽略。exec 前把「当前被忽略」的可捕获信号重置回 SIG_DFL，让被 exec 的
 * 工具能自己安装/触发 handler（如 `signal(SIGINT, handler)` 优雅退出）。
 */
void reset_inherited_signal_ignore() {
  struct sigaction sa;
  for (int sig = 1; sig < NSIG; ++sig) {
    if (sig == SIGKILL || sig == SIGSTOP) continue;
    if (sigaction(sig, nullptr, &sa) != 0) continue;
    if (sa.sa_handler == SIG_IGN) signal(sig, SIG_DFL);
  }
}

std::string g_tmp_dir;  // 应用沙箱可写目录（子进程 TMPDIR——musl tmpfile()/mkstemp 回退用）

/**
 * g_tmp_dir 惰性兜底。它正常由 worker() 赋值，但任何**不经 worker 的 exec 入口**（接线者后加的
 * 预览/探针类 NAPI，直接调 run_cmd）调用时它仍是空串——空串 setenv("TMPDIR","") 比不设更糟
 *（musl 拿到空 TMPDIR 的行为不可移植；fontconfig 类自举的 HOME/XDG_CACHE_HOME 同理，
 *  某库预览路径实测 2026-09-15）。这里自举到 cwd 下的可写临时目录：
 * run_cmd 的 cwd 契约本来就是「可写的沙箱工作目录」（worker 建好的 base/某库-run 或
 * filesDir），cwd 不可写时保持空串并由下方守卫跳过 setenv。
 */
static void ensure_tmp_dir(const std::string& cwd) {
  if (!g_tmp_dir.empty()) return;
  if (cwd.empty() || access(cwd.c_str(), W_OK) != 0) return;
  g_tmp_dir = cwd + "/.ohpt-tmp";
  mkdir_p(g_tmp_dir);
}

/**
 * 执行器：fork + execv（**不经 /bin/sh**），stdout+stderr 合并进 pipe 收回，返回退出码。
 * rc=127 通常是 exec 本身被拒（SELinux 标签不对/路径不存在），rc=126 是不可执行。
 *
 * alarm_sec：每条 exec 的看门狗秒数，0=不设。默认 90 防网络类用例挂死整个 worker；
 * **长用例显式传 0 或加大**——默认值会腰斩分钟级 exec（7zip F-01-05 mmt1 压缩单次 ~200s，
 * 2026-09-10 真机实证：alarm(90) 到点 SIGALRM 杀掉 7zz，用例假失败）。
 */
int run_cmd(const std::string& bin, const std::vector<std::string>& args, const std::string& cwd, std::string& out,
            unsigned alarm_sec = 90) {
  ensure_tmp_dir(cwd);
  int pfd[2];
  if (pipe(pfd) != 0) return -1;
  pid_t pid = fork();
  if (pid < 0) { close(pfd[0]); close(pfd[1]); return -1; }
  if (pid == 0) {
    dup2(pfd[1], STDOUT_FILENO);
    dup2(pfd[1], STDERR_FILENO);
    close(pfd[0]);
    close(pfd[1]);
    reset_inherited_signal_ignore();
    // 每条用例的看门狗：alarm 挂起的定时器在 execv 后保留，默认 SIGALRM 处置终止进程——
    // 防挂死截断后续全部证据（TAP 逐条实时打）。0 = 本条明确不设（长用例）。
    if (alarm_sec > 0) alarm(alarm_sec);
    if (!cwd.empty() && chdir(cwd.c_str()) != 0) _exit(126);
    // 依赖 .so 与工具同目录（build-hap.sh 的 EXTRA_LIB 打进 pkg/bin）：设 LD_LIBRARY_PATH
    // 才能被动态链接器解析（ELF 链接期 RPATH 是宿主路径，设备上无效）。
    {
      std::string bin_dir = bin.substr(0, bin.find_last_of('/'));
      ohpt_node_env(bin_dir);
    }
    // TMPDIR：musl tmpfile()/mkstemp 硬编码 /tmp，鸿蒙PC app 域不可建（E129 同源）——
    // 指到应用沙箱可写目录，被测代码里的临时文件创建才能工作（libetpan maildir 实证）。
    // 守卫：cwd 不可写时 ensure_tmp_dir 保持空串，空串 setenv 比不设更糟——跳过。
    if (!g_tmp_dir.empty()) setenv("TMPDIR", g_tmp_dir.c_str(), 1);
    std::vector<char*> argv;
    argv.push_back(const_cast<char*>(bin.c_str()));
    for (const auto& a : args) argv.push_back(const_cast<char*>(a.c_str()));
    argv.push_back(nullptr);
    execv(bin.c_str(), argv.data());
    // STDOUT_FILENO 已在子进程开头 dup2 到了 pfd[1]（第 131 行），然后才 close(pfd[1])（第 134 行）。
    // dup2 后 STDOUT_FILENO 是 pfd[1] 的副本——原 fd 关闭后副本仍有效，故写 STDOUT_FILENO 即可。
    dprintf(STDOUT_FILENO, "execv(%s) failed errno=%d (%s)\n", bin.c_str(), errno, strerror(errno));
    _exit(127);
  }
  close(pfd[1]);
  char buf[4096];
  ssize_t n;
  while ((n = read(pfd[0], buf, sizeof(buf))) > 0) out.append(buf, static_cast<size_t>(n));
  close(pfd[0]);
  int st = 0;
  waitpid(pid, &st, 0);
  return WIFEXITED(st) ? WEXITSTATUS(st) : (WIFSIGNALED(st) ? -128-WTERMSIG(st) : -2);
}

/**
 * 定位私有 HNP 里的二进制：/data/app/bin/<tool> 是符号链接，realpath 解析到
 * /data/app/<bundle>.org/<name>_<ver>/bin/<tool>。execv 用解析后的真实路径最稳。
 */
std::string tool_path() {
  char buf[PATH_MAX];
  if (realpath("/data/app/bin/ohportsdeviceidnode", buf)) return buf;
  return "/data/app/bin/ohportsdeviceidnode";  // 兜底：让 execv 去报错，errno 进日志便于定位
}

/**
 * 一条用例的记账：ok 即 `ok <n> <name>`，否则 `not ok` 并附输出，便于宿主侧 grep 判读。
 * add() 即时 hlog——长套件不必等全部跑完才见第一批 TAP 行（也避免「全部输出堆在末尾一锅端」
 * 把 hilog 缓冲挤爆，宿主侧轮询可看到实时进度）。
 * failed_names：失败用例名留账——收尾取证按它定位 raw 段落做限流回传（某国密 OpenSSL 分支 2026-09-17）。
 */
struct Tap {
  std::string log;
  int index = 0;
  int failed = 0;
  std::vector<std::string> failed_names;
  void add(bool ok, const std::string& name, const std::string& detail = "") {
    ++index;
    std::string line = (ok ? "ok " : "not ok ") + std::to_string(index) + " " + name;
    if (!ok && !detail.empty()) line += " -- " + detail.substr(0, 300);
    log += line + "\n";
    hlog("TAP| " + line);
    if (!ok) { ++failed; failed_names.push_back(name); }
  }
};

/**
 * 失败段落限流回传（hilog 环形缓冲尾部自证原则，某国密 OpenSSL 分支 2026-09-17 实证）：
 * 全量 RAW dump 会把先前实时打的 TAP 行挤出环形缓冲并触发进程级流控（2939 行截断实证，
 * 宿主侧计划行/汇总行/完成标记全缺失 → 验收整体驳回声称值）。所以：
 *   1. RAW 只回传失败段落——raw 段头约定 `--- <id>[ <cmd>] (rc=…) ---`，按行切段，
 *      段名与失败用例名前缀匹配（边界 ' ' 或 '/'），每段 head 60 + tail 20 行，总量 2000 行 cap；
 *   2. 收尾重放全量 TAP（tap_log 含逐条 ok/not ok + 计划行 1..N + PASS/FAIL 汇总行）——
 *      宿主最后抓 hilog 时缓冲尾部必有完整 TAP + end 标记，四要素不缺。
 * 全过时打一行 (none) 占位，证明取证段真实执行过。
 */
void dump_failure_sections(const std::string& raw, const std::vector<std::string>& failed_names,
                           const size_t total_cap = 2000, const size_t head_cap = 60,
                           const size_t tail_cap = 20) {
  if (failed_names.empty()) {
    hlog("RAW-FAIL| (none — all cases passed)");
    return;
  }
  auto name_matches = [](const std::string& section, const std::string& failed) {
    if (section == failed) return true;
    if (section.size() > failed.size() &&
        section.compare(0, failed.size(), failed) == 0) {
      char b = section[failed.size()];
      return b == '/' || b == ' ';
    }
    return false;
  };
  // 切段：段头行形如 "--- <id>[ <cmd>] (rc=…) ---"（"--- " 为 4 字符前缀，逐行扫描）
  std::vector<std::pair<std::string, std::vector<std::string>>> sections;
  {
    std::istringstream ss(raw);
    std::string line;
    while (std::getline(ss, line)) {
      if (line.size() > 4 && line.compare(0, 4, "--- ") == 0) {
        size_t sp = line.find(" (rc=");
        if (sp != std::string::npos) {
          sections.push_back({line.substr(4, sp - 4), {}});
          continue;
        }
      }
      if (!sections.empty()) sections.back().second.push_back(line);
    }
  }
  size_t dumped = 0;
  for (const auto& sec : sections) {
    bool want = false;
    for (const auto& f : failed_names) if (name_matches(sec.first, f)) { want = true; break; }
    if (!want) continue;
    const auto& lines = sec.second;
    hlog("RAW-FAIL| >>> " + sec.first + " (" + std::to_string(lines.size()) + " lines)");
    auto emit = [&](const std::string& l) {
      if (dumped >= total_cap) return;
      hlog("RAW-FAIL| " + l);
      ++dumped;
    };
    if (lines.size() <= head_cap + tail_cap) {
      for (const auto& l : lines) emit(l);
    } else {
      for (size_t i = 0; i < head_cap; i++) emit(lines[i]);
      emit("... [" + std::to_string(lines.size() - head_cap - tail_cap) + " lines omitted] ...");
      for (size_t i = lines.size() - tail_cap; i < lines.size(); i++) emit(lines[i]);
    }
    if (dumped % 200 == 0) usleep(20000);  // 避开 hilog 进程级流控
    if (dumped >= total_cap) { hlog("RAW-FAIL| [total cap reached]"); break; }
  }
}

// ---- worker 线程状态（ArkTS 侧 pollStatus() 轮询；7zip 案例 397 秒全套已实证不冻屏） ----
std::mutex g_mu;
std::atomic<bool> g_running{false};
std::string g_result;
// 当前用例的中文判定点结论（OHPT_CHECK 追加；worker 每条开始时清空、结束时并入 raw——
// worker 单线程串行消化队列，无并发写）
std::string g_check_notes;
// 当前用例的执行过程叙述（OHPT_NOTE 追加：每层「发生了什么」一行，人话）——
// 判定结论只说「过没过+实际发生了预期里的啥」，过程行补「每一层做了什么」，
// 测试同学排障不用翻 hilog（codec2 反馈 2026-09-12：结果除表层结论外要有每层日志）。
std::string g_proc_notes;
// 行级实时进度（pollProgress NAPI 读取；worker 单飞写）：整表入队模式下页面每 200ms
// 轮询一次，把「正在跑哪条」实时点亮到用例行——否则整表从发车到收车期间页面全程
// pending 无反馈，长套件像卡死（某库 2026-09-16 用户反馈，本条与 pollProgress 配套）。
std::string g_current_case;  // 正在执行的用例 id（空 = 队列空闲/两条之间的间隙）
int g_done = 0;              // 已出队完成（含 blocked）的条数

/* 过程叙述行：接线体在关键步骤处随手打（如 OHPT_NOTE(id, "以 1600 模式创建编码器");），
 * 不参与判定、只进返回串的【执行过程】段。 */
#define OHPT_NOTE(id, text)                                                        \
  do { g_proc_notes += std::string("\n· ") + (text ? (text) : ""); (void)(id); } while (0)

// ---- OHPTCASE 结果行协议：result=<pass|fail|blocked> id=<case-id> ----
// verify-demo --cases 以它为机读判定来源。**blocked 也打 result= 行**（result=blocked，
// 与 pass/fail 平级的第三结果）——不打行才会被 fail-closed 记 null（某库 F-06-03 实证：
// 旧版打 "blocked id=…" 不带 result=，解析器认不出，首轮 run-all 该用例无结果行）。
static void ohpt_case_result(bool pass, const std::string& id, const std::string& detail) {
  OH_LOG_Print(LOG_APP, LOG_INFO, 0x0000, "OHPTCASE", "result=%{public}s id=%{public}s detail=%{public}s",
               pass ? "pass" : "fail", id.c_str(), detail.c_str());
}
static void ohpt_case_blocked(const std::string& id, const std::string& reason) {
  OH_LOG_Print(LOG_APP, LOG_INFO, 0x0000, "OHPTCASE", "result=%{public}s id=%{public}s detail=%{public}s",
               "blocked", id.c_str(), reason.c_str());
}

/**
 * 用例表：`--test-cases` 模式下由接线者填写（caseId → 可执行/cwd/参数），配合
 * runCase NAPI 的**串行队列**消化——页面 0ms 间隔连发 runCase，async worker 单飞会
 * busy 丢案（libetpan 38 案 R2 实测丢 28 条），必须入队排空。cwd 契约：fixture 相对
 * 路径按二进制的运行目录解析（如 imf/mime 用 "data"、smime 用 "unittest/…" 前缀）。
 * 留空 = 非用例集形态，runTool 走下方单工具冒烟。
 *
 * ⚠️ 执行名一致性警告（CLI demo 项目 2026-09-15 真机实证的手写坑）：
 *   - 主 CLI 的 exec 路径**只经 tool_path()**（它解析 /data/app/bin/ohportsdeviceidnode，名字由
 *     build-hap.sh 的 `cp "$src" "pkg/bin/ohportsdeviceidnode"` 决定）——不要手写别的字符串，
 *     手写 `bin_dir + "/compile"` 之类与 HNP 打包名不一致的名字 → execv errno=2 → rc=127
 *     → 用例全 fail/blocked。
 *   - kCases[].bin 是相对 bin_dir 的二进制**文件名**（主 CLI 用 "ohportsdeviceidnode"，测试 ELF 用真名）。
 *   - ohpt_custom_case() 的 run() 直接用传入的 tool 参数（= tool_path() 全路径），别再手拼。
 *
 * ⚠️ 脚本接线调用方式警告（随包脚本 runner 2026-09-18 真机实证的两连坑）：
 *   - 随包脚本（多用例调度器）必须**子进程**调用：run(tool, {roster_path, case_id})——
 *     用 tool（=bash ELF）作解释器显式执行脚本并传参，退出码 = 脚本内入口函数的
 *     return 值，POSIX 定死。
 *   - **禁止** `. source` 进当前 shell 再调内部函数：① source 时脚本入口块读到的
 *     $# 是外层 bash -c 的 0，凡 `$#=0 → 跑全量` 形态的入口都会误触发整套用例重跑
 *     （单例耗时虚增一个数量级）；② sourced 函数的 return 值经 bash 退出码传播，
 *     musl bash 上被观测到 FAIL 例 rc 归 0（FAIL xxx (rc=0) 伪象）——判定依据
 *     「rc==0 && 输出含 PASS <id>」直接失真。
 *   - 富用例体内要拉起脚本时同理：exec 用 tool 全路径当解释器，脚本路径 + 参数
 *     走 args 向量，不经 /bin/sh（app 域 /bin/sh 行为不确定）。
 *
 * 三种接法：
 *   {"F-01-01", "mytest", "bin", true, ""},                      // 单测试二进制：rc==0 即 pass
 *   {"F-01-02", nullptr, "", true, ""},                          // 富用例体：见 ohpt_custom_case()
 *   {"F-01-03", nullptr, "", false, "precondition-unmet: …"},    // blocked：打 result=blocked
 */
struct Case { const char* id; const char* bin; const char* cwd; bool runnable; const char* why; };
// 队列条目 = (caseId, inputs)：inputs 为页面输入框整段（空串 = 内置向量，机器跑批恒空）
using QueuedCase = std::pair<std::string, std::string>;
static const Case kCases[] = {
    // __OHPT_CASE_TABLE__（scaffold --test-cases 按用例清单在此生成行；手接时删掉本行照上面示例填）
};
static const size_t kCaseCount = sizeof(kCases) / sizeof(kCases[0]);
static std::vector<QueuedCase> g_queue;

const Case* case_by_id(const std::string& id) {
  for (size_t i = 0; i < kCaseCount; ++i) {
    if (id == kCases[i].id) return &kCases[i];
  }
  return nullptr;
}

/* 逐判定点结论行（与 ohpt_cases.h 的 OHPT_CHECK 同协议；本执行器自带表，无需引头文件）。
 * 双落点：hilog 结果行（机器判据）+ g_check_notes 追加中文结论（worker 结算时并入 raw，
 * 页面人工对照用）。行格式**以用例「预期」行为对照单位**：expect 传预期文本的子句（与
 * 05-testcases 的 expected_result 逐词一致，不传 checkpoint 文案——测试同学对照的是页面上方
 * 的「预期:」整行，判定点措辞与之不同会再引入一层翻译；codec2 测试同学反馈 2026-09-12），
 * 行形如「√ <预期子句> —— <人话实际>」；actual 写「实际发生了预期里的什么事」，不写裸机器值。
 * 机器判据不受影响：checkpoint-verdict-complete 按 cp 序号+ok 对账，expect 仅查非空。
 * 过程日志另走 g_proc_notes。 */
#define OHPT_CHECK(id, cp, ok, expect, actual)                                                    \
  do {                                                                                            \
    OH_LOG_Print(LOG_APP, LOG_INFO, 0x0000, "OHPTCASE",                                           \
                 "check id=%{public}s cp=%{public}d ok=%{public}d expect=%{public}s actual=%{public}s", \
                 (id), (cp), (ok) ? 1 : 0, (expect) ? (expect) : "", (actual) ? (actual) : "");   \
    g_check_notes += std::string((ok) ? "\n√ " : "\n× ") + (expect ? (expect) : "") +             \
                     " —— " + (actual ? (actual) : "");                                           \
  } while (0)

/**
 * **富用例体**（kCases 表里 bin=nullptr 的条目走到这里）：一条用例 = 多步 exec + 内容断言，
 * 表达「一用例一测试二进制」覆盖不了的场景——如 7zip 的 a→l→x→h 多步调用、文件存在性/大小/
 * 哈希比对、多线程计时比较。返回 ok；detail 进结果行，raw 进 RAW 回传。
 *
 * 可用助手（本函数内 lambda）：
 *   run(args, tmo=0)     fork+execv 主工具（tmo=看门狗秒数，0=不设——长 exec 传 0，网络类传 90）
  *   mkc(rel, content)    建 fixture 文件（自动建父目录）
  *   path_of(name)        工作区 D 下的绝对路径
  *   exists(p) / fsize(p) 文件存在 / 大小（字节）
  *   now_ms()             毫秒时钟（计时类断言）
  *   gen_large_file(p,n)  生成 n 字节确定性伪随机文件（不可压缩数据）
  * ⚠️ 断言钉**内容**（输出串/文件字节/条目名），勿只判 rc==0；每个判定点一行 OHPT_CHECK。
  * ⚠️ 断言要件覆盖（demo-wiring-pc）：判定点文本里的数量/大小/上限要件都要有对应断言——
  *    只验存在=弱断言；actual 带观测清单。数量类场景的通用套路（分卷/多文件/批量产物）：
  *      int n = 0; long long max_sz = 0; std::string list;
  *      while (true) {  // 后缀递增计数：vol.7z.001/.002/… 或 out_1.txt/out_2.txt/…
  *        char suf[16]; snprintf(suf, sizeof(suf), ".%03d", n + 1);
  *        const std::string vp = path_of("xxx") + suf;
  *        if (!exists(vp)) break;
  *        ++n; long long sz = fsize(vp);
  *        if (sz > max_sz) max_sz = sz;
  *        list += (list.empty() ? "" : " ") + std::string(suf) + "(" + std::to_string(sz) + "B)";
  *      }
 *      ok = (rc == 0) && n >= 期望下限 && max_sz <= 上限;  // 数量与尺寸两个要件同时断言
 *      OHPT_CHECK(id, cp, ok, "<判定点原文>", ok ? "生成 N 个…: " + list : "…");
 *    （7zip F-08-01 实证：只验 exists(.001) 时 6 卷全对却呈现"只生成一个"——2026-09-14）
 *
 * 步骤输入（第 6 参 inputs，某媒体库媒体文件路径参数化 2026-09-21）：
 *   - 页面各步输入框内容按步骤序以 '\n' 连接（单步=原文），经 runCase 第 3 参 → 队列 → 本参传入；
 *   - **空串 = 内置向量**（机器跑批/页面清空输入都落这里）——内置行为必须与 05-testcases 的
 *     input.default 语义一致（空输入与预填 default 等价，测试同学才不会困惑）；
 *   - 非空 = 整段交给用例体自解析：文件路径类用它替换被播放/被加载的文件；参数类按空白
 *     tokenize 成 argv 追加或替换。解析失败（如文件不存在）如实用 OHPT_CHECK 打 ×，不静默回落。
 */
static bool ohpt_custom_case(const std::string& id, const std::string& tool, const std::string& sandbox,
                             std::string& detail, std::string& raw, const std::string& inputs = "") {
  const std::string D = sandbox + "/t";
  rm_rf(D);
  mkdir_p(D);

  auto mkc = [&](const std::string& rel, const std::string& content) -> std::string {
    std::string p = D + "/" + rel;
    size_t slash = p.rfind('/');
    if (slash != std::string::npos) mkdir_p(p.substr(0, slash));
    write_file(p, content);
    return p;
  };
  auto run = [&](const std::vector<std::string>& args, unsigned tmo = 0) -> std::pair<int, std::string> {
    std::string o;
    int rc = run_cmd(tool, args, sandbox, o, tmo);
    raw += "--- " + id + " " + args.front() + " (rc=" + std::to_string(rc) + ") ---\n" + o + "\n";
    return {rc, o};
  };
  auto path_of = [&](const std::string& name) -> std::string { return D + "/" + name; };
  auto exists = [&](const std::string& p) -> bool { struct stat st; return stat(p.c_str(), &st) == 0; };
  auto fsize = [&](const std::string& p) -> long long {
    struct stat st; if (stat(p.c_str(), &st) != 0) return -1; return static_cast<long long>(st.st_size);
  };
  auto now_ms = []() -> long long {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count();
  };
  auto gen_large_file = [](const std::string& p, size_t total_bytes) {
    mkdir_p(p.substr(0, p.rfind('/')));
    FILE* f = fopen(p.c_str(), "wb");
    if (!f) return;
    char buf[1 << 16];
    unsigned x = 0x2F6E2B1u;
    size_t remain = total_bytes;
    while (remain > 0) {
      size_t chunk = remain > sizeof(buf) ? sizeof(buf) : remain;
      for (size_t i = 0; i < chunk; ++i) {
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        buf[i] = static_cast<char>(x & 0xFF);
      }
      fwrite(buf, 1, chunk, f);
      remain -= chunk;
    }
    fclose(f);
  };
  (void)mkc; (void)run; (void)path_of; (void)exists; (void)fsize; (void)now_ms; (void)gen_large_file;  // 未用助手压 unused

  // __OHPT_CASE_BODIES__（scaffold --test-cases 按用例清单在此生成分发骨架）

  detail = "custom case not wired: " + id;
  return false;
}

/**
 * 执行一条表内用例。返回 0=pass，1=fail，2=blocked（未 exec，打 result=blocked 说明行）。
 * bin=nullptr 走 ohpt_custom_case（富用例体）；bin 为测试二进制走单 exec。
 * ⚠️ 断言要钉住**内容**（版本号/文件字节/条目名），不要只判 rc==0——空 stub 也能 rc=0，
 * 那是假绿（GLFW 案例 smoke 假绿的同型）。assert 型自证还有 NDEBUG 空洞：构建带 -DNDEBUG
 * （release 惯配）时 assert 被整体编译掉，空实现也 rc=0——证据行打进 stdout（PROBE|对象|标签|实际值），
 * 编译期语义用 SFINAE + static_assert 探针，接线体带行尾 \n 逐行比对、分层 OHPT_CHECK。
 * 配方见 pc-test-design/references/demo-wiring-pc.md「证据行与编译期探针」；错误图谱 E173。
 */
int exec_case(const Case& c, const std::string& bin_dir, const std::string& pkg_root,
              const std::string& tool, const std::string& sandbox, std::string& raw, Tap& tap,
              const std::string& inputs = "") {
  if (!c.runnable) {
    ohpt_case_blocked(c.id, c.why);
    raw += std::string("--- ") + c.id + " BLOCKED " + c.why + "\n";
    return 2;
  }
  if (c.bin == nullptr) {
    // 富用例体：多步 exec + 内容断言（判定在 ohpt_custom_case 内，含逐判定点 OHPT_CHECK）
    std::string detail;
    const bool ok = ohpt_custom_case(c.id, tool, sandbox, detail, raw, inputs);
    ohpt_case_result(ok, c.id, detail);
    tap.add(ok, c.id, detail);
    return ok ? 0 : 1;
  }
  const std::string bin = bin_dir + "/" + c.bin;
  const std::string case_cwd = (std::string(c.cwd) == "bin") ? bin_dir : pkg_root + "/" + c.cwd;
  std::string out;
  int rc = run_cmd(bin, {}, case_cwd, out);
  const bool ok = (rc == 0);
  raw += "--- " + std::string(c.id) + " via " + c.bin + " (rc=" + std::to_string(rc) + ") ---\n" + out + "\n";
  std::string detail = "via " + std::string(c.bin) + " rc=" + std::to_string(rc);
  if (!ok) detail += " out=" + out.substr(0, 240);
  ohpt_case_result(ok, c.id, detail);
  tap.add(ok, c.id, detail);
  return ok ? 0 : 1;
}

/** 全套用例跑在 worker 线程：跑完把 TAP 全文写进 g_result，ArkTS 轮询取走。 */
void worker(std::string base) {
  const std::string tool = tool_path();
  const std::string bin_dir = tool.substr(0, tool.find_last_of('/'));
  const std::string pkg = bin_dir.substr(0, bin_dir.find_last_of('/'));
  const std::string cwd = base + "/node-run";
  mkdir_p(cwd); g_tmp_dir = base + "/tmp"; mkdir_p(g_tmp_dir);
  std::string raw;
  const int rc = run_cmd(tool, ohpt_node_args({pkg+"/scripts/node-entry.cjs",pkg+"/scripts/node-suite-entry.cjs","all"}),cwd,raw,120);
  raw += "\nOHPTSTART child_exit="+std::to_string(rc)+"\n";
  write_file(base+"/run-raw.log",raw);
  std::istringstream lines(raw);std::string line;while(std::getline(lines,line))hlog(line);
  std::lock_guard<std::mutex> lock(g_mu);g_queue.clear();g_current_case.clear();g_result=raw;g_running=false;
}

}  // namespace

// NAPI: runTool(filesDir) → "started"（worker 线程跑全套，长测试不冻 UI）；已在跑返回 "busy"
// 用例表非空时：整表入队（run-all 语义）；表空时：单工具冒烟。
// 防重入第二道闸（连点闪退实证 2026-09-15 codec2：2 秒 8 轮 worker + 8 层页面栈后进程死）：
// **上轮结果未被 pollStatus 取走前一律 busy**——连点幂等复用首轮结果，读取即消费。
static napi_value RunTool(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  char files_dir[PATH_MAX] = {0};
  size_t len = 0;
  if (argc >= 1) napi_get_value_string_utf8(env, args[0], files_dir, sizeof(files_dir), &len);
  const std::string base = (len > 0) ? std::string(files_dir) : std::string("/data/storage/el2/base/haps/entry/files");

  bool expect_false = false;
  if (!g_running.compare_exchange_strong(expect_false, true)) {
    napi_value out = nullptr;
    napi_create_string_utf8(env, "busy", NAPI_AUTO_LENGTH, &out);
    return out;
  }
  {
    std::lock_guard<std::mutex> lk(g_mu);
    if (!g_result.empty()) {  // 上轮结果未取走：退回 busy（pollStatus 读取即消费）
      g_running = false;
      napi_value out = nullptr;
      napi_create_string_utf8(env, "busy", NAPI_AUTO_LENGTH, &out);
      return out;
    }
    g_result.clear();
    g_queue.clear();
    g_current_case.clear();  // 行级进度归零（新一轮整表）
    g_done = 0;
    for (size_t i = 0; i < kCaseCount; ++i) g_queue.push_back({kCases[i].id, ""});  // 整表入队无页面输入=内置向量
  }
  std::thread(worker, base).detach();

  napi_value out = nullptr;
  napi_create_string_utf8(env, "started", NAPI_AUTO_LENGTH, &out);
  return out;
}

// NAPI: runCase(filesDir, caseId, inputs?) → "queued" | "unknown"（--test-cases 接线用：入队单条）
// inputs = 页面各步输入框内容按步骤序 '\n' 连接的整段（可省略；空串 = 内置向量）。
// 页面 0ms 间隔连发也不丢案：常驻 worker 排空队列后才打 summary（「跑完了」停点）。
static napi_value RunCase(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  char files_dir[PATH_MAX] = {0};
  size_t len = 0;
  if (argc >= 1) napi_get_value_string_utf8(env, args[0], files_dir, sizeof(files_dir), &len);
  const std::string base = (len > 0) ? std::string(files_dir) : std::string("/data/storage/el2/base/haps/entry/files");

  char case_id[128] = {0};
  size_t clen = 0;
  if (argc >= 2) napi_get_value_string_utf8(env, args[1], case_id, sizeof(case_id), &clen);
  const std::string only = (clen > 0) ? std::string(case_id) : std::string();

  std::string case_inputs;
  if (argc >= 3) {
    char in_buf[2048] = {0};
    size_t ilen = 0;
    if (napi_get_value_string_utf8(env, args[2], in_buf, sizeof(in_buf), &ilen) == napi_ok) {
      case_inputs = in_buf;
    }
  }

  if (case_by_id(only) == nullptr) {
    napi_value out = nullptr;
    napi_create_string_utf8(env, "unknown", NAPI_AUTO_LENGTH, &out);
    return out;
  }

  bool start_worker = false;
  {
    std::lock_guard<std::mutex> lk(g_mu);
    g_queue.push_back({only, case_inputs});
    start_worker = !g_running.exchange(true);
    if (start_worker) {
      g_result.clear();
      g_current_case.clear();  // 仅新 worker 会话才归零——链式入队不动在跑会话的计数
      g_done = 0;
    }
  }
  if (start_worker) {
    std::thread(worker, base).detach();
  }

  napi_value out = nullptr;
  napi_create_string_utf8(env, "queued", NAPI_AUTO_LENGTH, &out);
  return out;
}

// NAPI: pollStatus() → "RUNNING" | 结果全文（TAP + 汇总）| "IDLE"（从未跑过）
static napi_value PollStatus(napi_env env, napi_callback_info /*info*/) {
  std::string s;
  if (g_running.load()) {
    s = "RUNNING";
  } else {
    std::lock_guard<std::mutex> lk(g_mu);
    s = g_result.empty() ? "IDLE" : g_result;
    if (!s.empty() && s != "IDLE") { g_result.clear(); }  // 读取即消费（RunTool 防重入闸②）
  }
  napi_value out = nullptr;
  napi_create_string_utf8(env, s.c_str(), NAPI_AUTO_LENGTH, &out);
  return out;
}

// NAPI: pollProgress() → "done=<n>;current=<case-id>"（行级实时进度；current 空 = 无在跑条目）
// 只读两个标量，页面 200ms 轮询无害；与 pollStatus 的「结果全文」通道互不干扰——
// 整表入队模式下结果只在收车时一次性可取，此接口补足「现在跑到哪条」的实时反馈。
static napi_value PollProgress(napi_env env, napi_callback_info /*info*/) {
  char buf[160] = {0};
  {
    std::lock_guard<std::mutex> lk(g_mu);
    snprintf(buf, sizeof(buf), "done=%d;current=%s", g_done, g_current_case.c_str());
  }
  napi_value out = nullptr;
  napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &out);
  return out;
}

EXTERN_C_START
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
      {"runTool", nullptr, RunTool, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"runCase", nullptr, RunCase, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"pollStatus", nullptr, PollStatus, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"pollProgress", nullptr, PollProgress, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
  return exports;
}
EXTERN_C_END

static napi_module demoModule = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = Init,
    .nm_modname = "node_demo",
    .nm_priv = nullptr,
    .reserved = {0},
};

extern "C" __attribute__((constructor)) void RegisterDemoModule(void) {
  napi_module_register(&demoModule);
}
