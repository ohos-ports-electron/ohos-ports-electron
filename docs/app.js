var allPackages = [];
var currentFilter = 'all';
var currentPage = 1;
var pageSize = 100;
var currentData = [];
var loadAttempt = 0;
var npmScope = '@ohos-ports-electron/';

function element(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function fetchFile(path) {
  var response = await fetch(path, {cache: 'no-cache'});
  if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
  return response;
}

async function loadData() {
  var attempt = ++loadAttempt;
  document.getElementById('info').textContent = '正在加载包列表…';
  try {
    var responses = await Promise.all([fetchFile('data/index.json'), fetchFile('data/packages.jsonl')]);
    var index = await responses[0].json();
    var text = await responses[1].text();
    var packages = text.split('\n').filter(function(line) { return line.trim(); }).map(function(line) { return JSON.parse(line); });
    if (index.npm_org !== 'ohos-ports-electron' || packages.some(function(p) { return typeof p.name !== 'string' || !p.name.startsWith(npmScope); })) {
      throw new Error('包列表的 npm 组织与本站配置不一致');
    }
    if (attempt !== loadAttempt) return;
    allPackages = packages;
    var updated = new Date(index.last_updated);
    document.getElementById('updated').textContent = ' · 同步时间：' + (Number.isNaN(updated.getTime()) ? index.last_updated : updated.toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false})) + '（北京时间）';
    renderStats();
    renderTable();
  } catch (error) {
    if (attempt !== loadAttempt) return;
    allPackages = [];
    currentData = [];
    document.getElementById('stats').replaceChildren();
    document.getElementById('tbody').replaceChildren();
    document.getElementById('pagination').style.display = 'none';
    var info = document.getElementById('info');
    info.textContent = '加载数据失败：' + error.message + ' ';
    var retry = element('button', 'tab', '重试');
    retry.addEventListener('click', loadData);
    info.append(retry);
  }
}

function renderStats() {
  var stats = document.getElementById('stats');
  stats.replaceChildren();
  var items = [
    [allPackages.length, '已发布包', ''],
    [allPackages.filter(function(p) { return p.electron_oh_version; }).length, '有 electron-oh 标签', ''],
    [allPackages.filter(function(p) { return p.deprecated; }).length, '已废弃', 'deprecated']
  ];
  items.forEach(function(item) {
    var card = element('div', 'stat ' + item[2]);
    card.append(element('div', 'num', item[0]), element('div', 'label', item[1]));
    stats.append(card);
  });
}

function getFiltered() {
  var query = document.getElementById('search').value.trim().toLowerCase();
  return allPackages.filter(function(p) {
    if (currentFilter === 'deprecated' && !p.deprecated) return false;
    if (currentFilter === 'electron-oh' && !p.electron_oh_version) return false;
    return !query || [p.name, p.short_name, p.original_name, p.description].some(function(value) {
      return (value || '').toLowerCase().includes(query);
    });
  });
}

function renderTable() {
  currentData = getFiltered();
  currentPage = 1;
  renderPage();
}

function packageLink(name) {
  var link = element('a', '', name);
  link.href = 'https://www.npmjs.com/package/' + encodeURIComponent(name);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function versionCell(version, className) {
  var cell = element('td');
  cell.append(element('span', 'pkg-ver ' + (version ? className : 'none'), version || '—'));
  return cell;
}

function renderPage() {
  var tbody = document.getElementById('tbody');
  var info = document.getElementById('info');
  var pagination = document.getElementById('pagination');
  tbody.replaceChildren();
  if (!currentData.length) {
    info.textContent = allPackages.length ? '未找到匹配的包' : '该组织暂无公开发布的包';
    pagination.style.display = 'none';
    return;
  }
  var totalPages = Math.ceil(currentData.length / pageSize);
  currentPage = Math.max(1, Math.min(currentPage, totalPages));
  var start = (currentPage - 1) * pageSize;
  var displayed = currentData.slice(start, start + pageSize);
  displayed.forEach(function(p) {
    var row = element('tr');
    var name = element('td', 'pkg-name');
    name.append(packageLink(p.name));
    var original = element('td', 'pkg-orig');
    if (p.original_name) original.append(packageLink(p.original_name));
    else original.textContent = '—';
    var status = element('td');
    var badge = element('span', 'badge ' + (p.deprecated ? 'badge-deprecated' : 'badge-normal'), p.deprecated ? '已废弃' : '已发布');
    if (p.deprecated_message) badge.title = p.deprecated_message;
    status.append(badge);
    var install = element('td');
    var command = 'npm i ' + p.name;
    var button = element('button', 'install-cmd', command);
    button.title = '复制安装命令';
    button.addEventListener('click', function() { copyText(command); });
    install.append(button);
    row.append(name, original, versionCell(p.latest_version, 'stable'), versionCell(p.electron_oh_version, 'stable'), versionCell(p.beta_version, 'beta'), status, install);
    tbody.append(row);
  });
  info.textContent = '共 ' + currentData.length + ' 个包（第 ' + currentPage + '/' + totalPages + ' 页，当前 ' + displayed.length + ' 条）';
  pagination.style.display = totalPages > 1 ? 'flex' : 'none';
  document.getElementById('prevPage').disabled = currentPage === 1;
  document.getElementById('nextPage').disabled = currentPage === totalPages;
  document.getElementById('pageInfo').textContent = currentPage + ' / ' + totalPages;
}

function changePage(delta) {
  currentPage += delta;
  renderPage();
  window.scrollTo(0, 0);
}

async function copyText(text) {
  var info = document.getElementById('info');
  try {
    await navigator.clipboard.writeText(text);
    info.textContent = '已复制：' + text;
  } catch (error) {
    info.textContent = '请手动复制安装命令：' + text;
  }
}

function switchTab(filter) {
  currentFilter = filter;
  document.querySelectorAll('.tab[data-filter]').forEach(function(tab) {
    var active = tab.dataset.filter === filter;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  renderTable();
}

document.getElementById('search').addEventListener('input', function() {
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(renderTable, 200);
});

loadData();
