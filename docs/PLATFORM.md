# Electron OH 包查询平台

本平台复用上游 ohos-ports 查询页，托管于 `ohos-ports-electron/ohos-ports-electron`，展示 npm 组织 `@ohos-ports-electron` 的公开包。

| 用途 | 地址 |
| --- | --- |
| GitHub 仓库 | https://github.com/ohos-ports-electron/ohos-ports-electron |
| 网站（完成首次部署后可访问） | https://ohos-ports-electron.github.io/ohos-ports-electron/ |
| npm 组织公开页 | https://www.npmjs.com/org/ohos-ports-electron |
| npm 组织管理入口（需有权限的账号登录） | https://www.npmjs.com/settings/ohos-ports-electron/packages |

## 首次上线

1. 确认平台代码已合入组织仓库 `ohos-ports-electron/ohos-ports-electron` 的 `main`。
2. 打开仓库 **Settings → Pages**，将 **Build and deployment → Source** 设为 **GitHub Actions**。
3. 打开 **Actions**。如果 Fork 仓库提示需要启用工作流，先启用。
4. 选择 **Refresh and deploy Electron OH package site**，点击 **Run workflow**，分支选择 `main`。
5. 工作流成功后，访问 https://ohos-ports-electron.github.io/ohos-ports-electron/ 。若合入时 Pages 尚未启用导致第一次部署失败，完成第 2 步后重新运行即可。

团队后续修改建议从最新 `main` 创建分支，通过 Pull Request 合入：

```bash
cd /Users/guyun/Desktop/pc-tool/ohos-ports-electron
git switch main
git pull --ff-only
git switch -c feat/package-site-update
# 在此分支完成页面或数据采集逻辑的修改后，检查并提交：
git diff --check
git add README.md docs/index.html docs/app.js docs/update-packages.py docs/data/index.json docs/data/packages.jsonl docs/PLATFORM.md .github/workflows/pages-deploy.yml
git commit -m "feat: update Electron OH package site"
git push -u origin feat/package-site-update
gh pr create --repo ohos-ports-electron/ohos-ports-electron --base main --head feat/package-site-update --title "Update Electron OH package site" --body "Update the Electron OH npm package site."
```

如果推送工作流文件时 GitHub 提示认证缺少 `workflow` 权限，使用 `gh auth refresh -h github.com -s workflow` 按提示完成授权后重试推送。也可以使用已具备对应权限的 Git 客户端提交。

## 数据刷新与发布

`.github/workflows/pages-deploy.yml` 在 `main` 的页面或部署工作流修改后运行，也支持手动触发，每天北京时间凌晨 2:17 定时运行。GitHub 定时任务可能延迟；Fork 的定时任务若默认禁用，需要在 Actions 页面单独启用。长期没有活动的公共仓库可能需要重新启用定时任务。

工作流依次执行：检出源码、配置 Python、采集 npm 数据、上传 `docs/`、部署 GitHub Pages。它使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需配置 `PAT_TOKEN` 或 `NPM_TOKEN`，无需向源码仓库自动提交。运行时采集结果保存在本次部署的 artifact 中；仓库中提交的数据只是本地预览的快照。

工作流仅允许 `ohos-ports-electron/ohos-ports-electron` 的 `main` 分支部署。通过 GitHub Pages 的 `github-pages` environment 和仓库设置管理部署权限。网站地址不受 npm 组织名称影响，GitHub 账号和 npm 组织无需同名。

## 本地刷新与预览

需要 Python 3.9 或更高版本（推荐 3.12），不需要额外的 Python 包。

```bash
cd /Users/guyun/Desktop/pc-tool/ohos-ports-electron
NPM_ORG=ohos-ports-electron python3 docs/update-packages.py --skip-readme
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs
```

在浏览器访问 http://127.0.0.1:8765/ 。预览结束后在终端按 Ctrl+C。

采集脚本调用 npm Registry 的 `/-/user/ohos-ports-electron/package` 获取包列表，并按 `@ohos-ports-electron/` 前缀过滤，再获取各包的版本元数据。任一包读取失败会终止本次采集，工作流不会继续部署不完整数据。此包列表接口如发生变化，需要维护采集逻辑。

页面展示 `latest`、`electron-oh`、`beta` 标签当前指向的版本。`latest` 是默认安装标签，不代表版本号一定属于 SemVer 正式版。页面不再把仓库是否含有包目录解释为真实的 CI 发布来源。

新增公开包或版本后，运行上述工作流即可刷新；无需手工在 HTML 中添加包条目。尚未批准的 staged 包版本和私有包不会作为本平台的公开数据展示。

## 网站与包构建分别维护

本次仅修改网站、数据采集及页面部署。`ports/` 下的补丁、构建脚本和 npm 发布脚本仍按各自流程维护；网站不会自动改名或发布这些包。原有 `.github/workflows/ci.yml` 仍可能在 `ports/` 变化时触发，接入新 scope 的自动发布前应单独检查其中的发布目标和认证。

如需新增查询列，例如 Electron 版本、架构、验证报告，应采用包中明确发布的元数据或人工维护的映射，不能仅凭包名推断已验证的兼容范围。

上游项目与许可证： https://github.com/ohos-ports/ohos-ports ，保留仓库 `LICENSE` 中的 MIT 声明。
