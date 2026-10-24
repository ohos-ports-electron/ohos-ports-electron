/*
 * ohpt_artifacts.h — 用例产物通道（**测试载体私有，不进任何交付面**）
 * ---------------------------------------------------------------------------
 * 关闭的一类：**数据类库的功能产物是图像，用例只钉数据，demo 上无图可看**——
 * 上屏证据档被纯文本日志静默满足，要人验图的页面却没有图（libaribcaption 字幕位图 →
 * gmic BMP，同类第二次）。
 *
 * 通道的定义只有一句：**每条用例执行前对用例沙箱做快照、执行后对比，新出现或被改写的
 * 文件即该用例的产物。** bytes 与 FNV-1a64 由执行器算，登记行由执行器打——证据不由
 * 被判定者自报；接线方零协议：把图写进沙箱就够了。
 *
 * 登记行（机器证据，verify-demo 解析进 verify/<case>.json 的 artifacts[]）：
 *     OHPTCASE artifact id=<case> kind=<image|file> path=<绝对沙箱路径> bytes=<n> sha=<fnv1a64 hex>
 * 同一行文本也交回调用方拼进本条用例的原始输出——页面按 kind=image 的 path 上屏
 *（Image('file://'+path)），file 类只列名字与大小。
 *
 * 由生成器复制进每个带 native 目录的 demo 工程（`entry/src/main/cpp/`）：
 *   · cli-hnp-runner 执行器 worker：exec_case 前 snapshot(cwd) / 后 collect(cwd, id, buf, cap)
 *   · 自驱档驱动器（ohpt_cases.h 的 ohpt_run_once）：ohpt_dispatch 前后同一对调用
 *   · cpp-lib-demo：NAPI ohptCaseBegin(filesDir) / ohptCaseEnd(filesDir, caseId)，ArkTS runner 夹住用例调用
 * C99 / C++ 皆可包含；单线程串行使用（worker / 驱动器都是串行的）。
 * ---------------------------------------------------------------------------
 */
#ifndef OHPT_ARTIFACTS_H
#define OHPT_ARTIFACTS_H

#include <dirent.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/stat.h>
#include <hilog/log.h>

#ifndef OHPT_ARTIFACTS_SNAPSHOT_MAX
#define OHPT_ARTIFACTS_SNAPSHOT_MAX 512 /* 快照登记上限：沙箱里已有的文件数 */
#endif
#ifndef OHPT_ARTIFACTS_MAX
#define OHPT_ARTIFACTS_MAX 64 /* 单条用例登记的产物上限（超出打 artifact-truncated 行） */
#endif
#ifndef OHPT_ARTIFACTS_DEPTH
#define OHPT_ARTIFACTS_DEPTH 4 /* 递归深度上限 */
#endif
#define OHPT_ARTIFACTS_PATH_CAP 512
/* 调用方收登记行文本的缓冲区大小（每行 ≤ 路径 + 键名/数值 128 字节） */
#define OHPT_ARTIFACTS_LINES_CAP (OHPT_ARTIFACTS_MAX * (OHPT_ARTIFACTS_PATH_CAP + 128))

typedef struct {
    char path[OHPT_ARTIFACTS_PATH_CAP];
    long long size;
    long long mtime_ns;
} OhptArtifactStamp;

typedef struct {
    OhptArtifactStamp items[OHPT_ARTIFACTS_SNAPSHOT_MAX];
    int count;
    int truncated;
} OhptArtifactSnapshot;

/* 每个包含本头的编译单元一份；worker / 驱动器串行使用，无并发写。 */
static OhptArtifactSnapshot ohpt_artifacts_snap_;

static inline long long ohpt_artifacts_mtime_ns(const struct stat* st) {
#if defined(__APPLE__)
    return (long long)st->st_mtimespec.tv_sec * 1000000000LL + (long long)st->st_mtimespec.tv_nsec;
#else
    return (long long)st->st_mtim.tv_sec * 1000000000LL + (long long)st->st_mtim.tv_nsec;
#endif
}

typedef void (*ohpt_artifacts_visit_fn)(const char* path, const struct stat* st, void* ud);

/* 递归遍历：点开头的目录/文件一律不看（.ohpt-tmp 等临时区），只登记普通文件（符号链接/设备不算产物）。 */
static inline void ohpt_artifacts_walk(const char* dir, int depth, ohpt_artifacts_visit_fn fn, void* ud) {
    DIR* d = opendir(dir);
    if (!d) return;
    struct dirent* e;
    while ((e = readdir(d)) != NULL) {
        if (e->d_name[0] == '.') continue;
        char p[OHPT_ARTIFACTS_PATH_CAP];
        if (snprintf(p, sizeof p, "%s/%s", dir, e->d_name) >= (int)sizeof p) continue;
        struct stat st;
        if (lstat(p, &st) != 0) continue;
        if (S_ISDIR(st.st_mode)) {
            if (depth < OHPT_ARTIFACTS_DEPTH) ohpt_artifacts_walk(p, depth + 1, fn, ud);
            continue;
        }
        if (!S_ISREG(st.st_mode)) continue;
        fn(p, &st, ud);
    }
    closedir(d);
}

static inline void ohpt_artifacts_snap_visit_(const char* path, const struct stat* st, void* ud) {
    OhptArtifactSnapshot* s = (OhptArtifactSnapshot*)ud;
    if (s->count >= OHPT_ARTIFACTS_SNAPSHOT_MAX) {
        s->truncated = 1;
        return;
    }
    OhptArtifactStamp* it = &s->items[s->count++];
    snprintf(it->path, sizeof it->path, "%s", path);
    it->size = (long long)st->st_size;
    it->mtime_ns = ohpt_artifacts_mtime_ns(st);
}

/** 执行前：登记沙箱 root 的现状（root 不存在也合法：之后写下的一切都算产物）。 */
static inline void ohpt_artifacts_snapshot(const char* root) {
    ohpt_artifacts_snap_.count = 0;
    ohpt_artifacts_snap_.truncated = 0;
    if (root && root[0]) ohpt_artifacts_walk(root, 0, ohpt_artifacts_snap_visit_, &ohpt_artifacts_snap_);
}

static inline int ohpt_artifacts_unchanged_(const char* path, const struct stat* st) {
    int i;
    for (i = 0; i < ohpt_artifacts_snap_.count; i++) {
        const OhptArtifactStamp* it = &ohpt_artifacts_snap_.items[i];
        if (strcmp(it->path, path) == 0) {
            return it->size == (long long)st->st_size && it->mtime_ns == ohpt_artifacts_mtime_ns(st);
        }
    }
    return 0; /* 快照里没有 = 本条用例新写下的 */
}

/** 扩展名 → kind。**分类只在这一处**：image 即 ArkUI Image 能解码的格式，其余一律 file。 */
static inline const char* ohpt_artifacts_kind(const char* path) {
    static const char* const image_ext[] = {"bmp", "png", "jpg", "jpeg", "webp", "gif", "heic", "svg"};
    const char* dot = strrchr(path, '.');
    const char* slash = strrchr(path, '/');
    size_t i;
    if (!dot || (slash && dot < slash) || dot[1] == '\0') return "file";
    for (i = 0; i < sizeof image_ext / sizeof image_ext[0]; i++) {
        if (strcasecmp(dot + 1, image_ext[i]) == 0) return "image";
    }
    return "file";
}

/** 文件内容 FNV-1a 64（可区分性的字节级证据）；bytes 收文件长度。 */
static inline uint64_t ohpt_artifacts_fnv1a64(const char* path, long long* bytes) {
    uint64_t h = 1469598103934665603ULL;
    unsigned char buf[8192];
    size_t n;
    long long total = 0;
    FILE* f = fopen(path, "rb");
    if (bytes) *bytes = 0;
    if (!f) return 0;
    while ((n = fread(buf, 1, sizeof buf, f)) > 0) {
        size_t i;
        total += (long long)n;
        for (i = 0; i < n; i++) {
            h ^= (uint64_t)buf[i];
            h *= 1099511628211ULL;
        }
    }
    fclose(f);
    if (bytes) *bytes = total;
    return h;
}

typedef struct {
    const char* case_id;
    char* out;
    size_t cap;
    size_t len;
    int count;
    int truncated;
} OhptArtifactCollect_;

static inline void ohpt_artifacts_collect_visit_(const char* path, const struct stat* st, void* ud) {
    OhptArtifactCollect_* c = (OhptArtifactCollect_*)ud;
    long long bytes = 0;
    uint64_t h;
    const char* kind;
    char line[OHPT_ARTIFACTS_PATH_CAP + 128];
    int n;
    if (ohpt_artifacts_unchanged_(path, st)) return;
    if (c->count >= OHPT_ARTIFACTS_MAX) {
        c->truncated = 1;
        return;
    }
    h = ohpt_artifacts_fnv1a64(path, &bytes);
    kind = ohpt_artifacts_kind(path);
    /* 机器证据：hilog（tag OHPTCASE，与 check/result 行同通道） */
    OH_LOG_Print(LOG_APP, LOG_INFO, 0x0000, "OHPTCASE",
                 "artifact id=%{public}s kind=%{public}s path=%{public}s bytes=%{public}lld sha=%{public}016llx",
                 c->case_id ? c->case_id : "unknown", kind, path, bytes, (unsigned long long)h);
    /* 同文本交回调用方（页面上屏用） */
    n = snprintf(line, sizeof line, "OHPTCASE artifact id=%s kind=%s path=%s bytes=%lld sha=%016llx\n",
                 c->case_id ? c->case_id : "unknown", kind, path, bytes, (unsigned long long)h);
    if (n > 0 && c->out && c->cap > 0 && c->len + (size_t)n < c->cap) {
        memcpy(c->out + c->len, line, (size_t)n);
        c->len += (size_t)n;
        c->out[c->len] = '\0';
    }
    c->count++;
}

/**
 * 执行后：对比快照，登记本条用例写下的文件。返回登记条数。
 * out/cap 可为 NULL/0（只打 hilog）；给了则收到「OHPTCASE artifact …\n」文本，供拼进本条原始输出。
 */
static inline int ohpt_artifacts_collect(const char* root, const char* case_id, char* out, size_t cap) {
    OhptArtifactCollect_ c;
    memset(&c, 0, sizeof c);
    c.case_id = case_id;
    c.out = out;
    c.cap = cap;
    if (out && cap > 0) out[0] = '\0';
    if (root && root[0]) ohpt_artifacts_walk(root, 0, ohpt_artifacts_collect_visit_, &c);
    if (c.truncated || ohpt_artifacts_snap_.truncated) {
        /* 不是 artifact 行（解析端不收），只说明登记不完整 */
        OH_LOG_Print(LOG_APP, LOG_WARN, 0x0000, "OHPTCASE",
                     "artifact-truncated id=%{public}s max=%{public}d snapshot_truncated=%{public}d",
                     case_id ? case_id : "unknown", OHPT_ARTIFACTS_MAX, ohpt_artifacts_snap_.truncated);
    }
    return c.count;
}

#endif /* OHPT_ARTIFACTS_H */
