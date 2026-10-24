'use strict';
async function run() {
  const button = document.getElementById('run');
  button.disabled = true;
  document.getElementById('summary').textContent = '正在调用设备 ID 存储 API…';
  try {
    const report = await window.pilot.run();
    const summary = document.getElementById('summary');
    summary.textContent = `${report.pass}/${report.total} 通过 · ${report.fail} 失败 · ${report.pending} 待冷启动验证`;
    summary.className = report.fail ? 'fail' : report.pending ? 'pending' : 'pass';
    const body = document.getElementById('cases');
    body.replaceChildren();
    for (const result of report.results) {
      const row = document.createElement('tr');
      for (const value of [result.name, result.status, result.detail]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      }
      row.className = result.status;
      body.appendChild(row);
    }
    document.getElementById('identity').textContent = JSON.stringify({runId:report.runId,pid:report.pid,
      versions:report.versions,packageFiles:report.packageFiles,packageVersion:report.packageVersion,userData:report.userData},null,2);
  } catch (error) {
    document.getElementById('summary').textContent = String(error.stack || error);
    document.getElementById('summary').className = 'fail';
  } finally { button.disabled = false; }
}
document.getElementById('run').addEventListener('click', run);
run();
