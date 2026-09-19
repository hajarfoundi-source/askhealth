/* =========================================================
   ASKHEALTH CRM — analytics.js
   ========================================================= */

let session;
let chartInstances = [];
const _mobile = () => window.innerWidth <= 768;

DB.init().then(function() {
  if (!Auth.requireLogin()) return;
  session = DB.getSession();
  renderSidebar('analytics');
  buildTopbarRight();
  refreshCharts();
});

function buildTopbarRight() {
  const el = document.getElementById('topbarRight');
  if (!el) return;
  const initials = session.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  el.innerHTML = `
    <div class="avatar" style="background:${session.color || '#1A6FA3'}">${initials}</div>
    <span style="font-size:13px;font-weight:600;color:#334155;">${session.name}</span>
    <span class="role-badge ${session.role}">${session.role === 'admin' ? 'Admin' : 'Rep'}</span>
  `;
}

function refreshCharts() {
  // Destroy existing chart instances
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];

  const isAdmin = session.role === 'admin';
  const allLeads = isAdmin ? DB.getLeads() : DB.getLeadsForUser(session.userId);
  const users = DB.getUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const container = document.getElementById('analyticsContent');
  container.innerHTML = '';

  // Scope note for reps
  if (!isAdmin) {
    const note = document.createElement('div');
    note.className = 'scope-note';
    note.textContent = 'Showing statistics for your assigned leads only.';
    container.appendChild(note);
  }

  // ── Stat cards ──────────────────────────────────────────
  const total      = allLeads.length;
  const confirmed  = allLeads.filter(l => l.stage === 'confirmed').length;
  const junkCancel = allLeads.filter(l => l.stage === 'junk' || l.stage === 'cancelled').length;
  const convRate   = total > 0 ? Math.round((confirmed / total) * 100) : 0;
  const badgeSent  = allLeads.filter(l => l.stage === 'badge_sent').length;
  const checkedIn  = allLeads.filter(l => l.checkedIn).length;

  const statsRow = document.createElement('div');
  statsRow.className = 'stats-row';
  statsRow.innerHTML = `
    <div class="stat-card" style="border-top-color:var(--primary)">
      <div class="stat-card-label">Total Leads</div>
      <div class="stat-card-value">${total}</div>
      <div class="stat-card-sub">All registrations</div>
    </div>
    <div class="stat-card" style="border-top-color:var(--green)">
      <div class="stat-card-label">Confirmed</div>
      <div class="stat-card-value">${confirmed}</div>
      <div class="stat-card-sub">Attendance confirmed</div>
    </div>
    <div class="stat-card" style="border-top-color:var(--red)">
      <div class="stat-card-label">Junk / Cancelled</div>
      <div class="stat-card-value">${junkCancel}</div>
      <div class="stat-card-sub">Removed from pipeline</div>
    </div>
    <div class="stat-card" style="border-top-color:var(--gold)">
      <div class="stat-card-label">Conversion Rate</div>
      <div class="stat-card-value">${convRate}%</div>
      <div class="stat-card-sub">Confirmed / Total</div>
    </div>
    <div class="stat-card" style="border-top-color:#D4A843">
      <div class="stat-card-label">Badges Sent</div>
      <div class="stat-card-value" style="color:#D4A843;">${badgeSent}</div>
      <div class="stat-card-sub">Physical badges dispatched</div>
    </div>
    <div class="stat-card" style="border-top-color:#805AD5">
      <div class="stat-card-label">Checked In</div>
      <div class="stat-card-value" style="color:#805AD5;">${checkedIn}</div>
      <div class="stat-card-sub">Scanned at event entry</div>
    </div>
  `;
  container.appendChild(statsRow);

  // ── Charts grid ──────────────────────────────────────────
  const chartsGrid = document.createElement('div');
  chartsGrid.className = 'charts-grid';
  container.appendChild(chartsGrid);

  // Chart 1: Leads by Stage
  const byStage = groupBy(allLeads, l => l.stage);
  const stageBox = makeChartBox('Leads by Stage');
  chartsGrid.appendChild(stageBox);
  const stageChart = new Chart(stageBox.querySelector('canvas'), {
    type: 'bar',
    data: {
      labels: DB.STAGES.map(s => s.label),
      datasets: [{
        label: 'Leads',
        data: DB.STAGES.map(s => byStage[s.id] || 0),
        backgroundColor: DB.STAGES.map(s => s.color + 'CC'),
        borderColor: DB.STAGES.map(s => s.color),
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { stepSize: 1 }, grid: { color: '#E2E8F0' } },
        y: { ticks: { font: { size: 11 } } }
      }
    }
  });
  chartInstances.push(stageChart);

  // Chart 2: Leads by Country
  const byCountry = groupBy(allLeads, l => l.country || 'Unknown');
  const countryLabels = Object.keys(byCountry);
  const countryBox = makeChartBox('Leads by Country');
  chartsGrid.appendChild(countryBox);
  const countryChart = new Chart(countryBox.querySelector('canvas'), {
    type: 'doughnut',
    data: {
      labels: countryLabels,
      datasets: [{
        data: countryLabels.map(k => byCountry[k]),
        backgroundColor: PALETTE.slice(0, countryLabels.length),
        borderWidth: 2,
        borderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: _mobile() ? 'bottom' : 'right', labels: { font: { size: 11 }, padding: _mobile() ? 8 : 12 } }
      }
    }
  });
  chartInstances.push(countryChart);

  // Chart 3: Leads by Interest
  const byInterest = groupBy(allLeads, l => l.interest || 'Unknown');
  const intLabels  = Object.keys(byInterest);
  const intBox = makeChartBox('Leads by Area of Interest');
  chartsGrid.appendChild(intBox);
  const intChart = new Chart(intBox.querySelector('canvas'), {
    type: 'bar',
    data: {
      labels: intLabels.map(l => { var max = _mobile() ? 10 : 18; return l.length > max ? l.slice(0, max - 2) + '…' : l; }),
      datasets: [{
        label: 'Leads',
        data: intLabels.map(k => byInterest[k]),
        backgroundColor: '#2AABDBCC',
        borderColor: '#2AABDB',
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { stepSize: 1 }, grid: { color: '#E2E8F0' } },
        x: { ticks: { font: { size: 10 } } }
      }
    }
  });
  chartInstances.push(intChart);

  // Chart 4 (admin): Rep Performance table + mini chart
  if (isAdmin) {
    const reps = DB.getRepList();
    const repBox = makeChartBox('Rep Performance');
    chartsGrid.appendChild(repBox);

    // Build table instead of chart (more readable)
    const table = document.createElement('table');
    table.className = 'rep-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Representative</th>
          <th>${_mobile() ? 'Asgn' : 'Assigned'}</th>
          <th>${_mobile() ? 'Cont' : 'Contacted'}</th>
          <th>${_mobile() ? 'Conf' : 'Confirmed'}</th>
          <th>Junk</th>
        </tr>
      </thead>
      <tbody>
        ${reps.map(rep => {
          const repLeads = allLeads.filter(l => l.assignedTo === rep.id);
          const initials = rep.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
          return `<tr>
            <td style="display:flex;align-items:center;gap:7px;">
              <div class="avatar avatar-sm" style="background:${rep.color}">${initials}</div>
              <span style="font-weight:600;">${escHtml(rep.name)}</span>
            </td>
            <td>${repLeads.length}</td>
            <td>${repLeads.filter(l=>l.stage==='contacted').length}</td>
            <td style="color:var(--green);font-weight:600;">${repLeads.filter(l=>l.stage==='confirmed').length}</td>
            <td style="color:var(--red);">${repLeads.filter(l=>l.stage==='junk').length}</td>
          </tr>`;
        }).join('')}
      </tbody>
    `;
    repBox.appendChild(table);
    // Remove canvas since we used a table
    repBox.querySelector('canvas').remove();
  } else {
    // Reps see a simple progress breakdown for themselves
    const repBox = makeChartBox('My Pipeline Breakdown');
    chartsGrid.appendChild(repBox);
    const myData = DB.STAGES.map(s => allLeads.filter(l => l.stage === s.id).length);
    const myChart = new Chart(repBox.querySelector('canvas'), {
      type: 'pie',
      data: {
        labels: DB.STAGES.map(s => s.label),
        datasets: [{
          data: myData,
          backgroundColor: DB.STAGES.map(s => s.color + 'CC'),
          borderColor: DB.STAGES.map(s => s.color),
          borderWidth: 1.5,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: _mobile() ? 'bottom' : 'right', labels: { font: { size: 11 }, padding: _mobile() ? 8 : 10 } } }
      }
    });
    chartInstances.push(myChart);
  }
}

// ── Helpers ───────────────────────────────────────────────

function makeChartBox(title) {
  const box = document.createElement('div');
  box.className = 'chart-box';
  box.innerHTML = `<div class="chart-box-title">${escHtml(title)}</div><canvas></canvas>`;
  return box;
}

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const PALETTE = [
  '#2AABDB','#1A6FA3','#D4A843','#38a169','#e53e3e',
  '#805AD5','#ED8936','#0F2D45','#64748B','#A0AEC0',
];
