/* =========================================================
   ASKHEALTH CRM — scanner.js
   QR check-in scanner for event day (admin only).
   ========================================================= */

let session, currentUser;
let html5QrCode = null;
let scanLog = [];

DB.init().then(function() {
  if (!Auth.requireLogin()) return;
  session = DB.getSession();
  if (session.role !== 'admin') {
    window.location.href = 'kanban.html';
    return;
  }
  currentUser = DB.getUser(session.userId);
  renderSidebar('scanner');
  buildTopbarRight();
  updateStats();
  renderCheckedInTable();
});

// ── Top bar ───────────────────────────────────────────────

function buildTopbarRight() {
  const el = document.getElementById('topbarRight');
  const initials = session.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  el.innerHTML = `
    <div class="avatar" style="background:${session.color || '#1A6FA3'}">${initials}</div>
    <span style="font-size:13px;font-weight:600;color:#334155;">${session.name}</span>
    <span class="role-badge admin">Admin</span>
  `;
}

// ── Stats ─────────────────────────────────────────────────

function updateStats() {
  const eligible = ['confirmed', 'badge_sent'];
  const leads = DB.getLeads().filter(l => eligible.includes(l.stage));
  const checkedIn = leads.filter(l => l.checkedIn).length;
  document.getElementById('statTotal').textContent     = leads.length;
  document.getElementById('statCheckedIn').textContent = checkedIn;
  document.getElementById('statRemaining').textContent = leads.length - checkedIn;
}

// ── QR Code scanning ──────────────────────────────────────

document.getElementById('startBtn').addEventListener('click', startCamera);
document.getElementById('stopBtn').addEventListener('click', stopCamera);

async function startCamera() {
  if (html5QrCode) return;

  setStatus('active', 'Scanning…');
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = '';

  html5QrCode = new Html5Qrcode('qr-reader');

  try {
    const cameras = await Html5Qrcode.getCameras();
    if (!cameras || cameras.length === 0) {
      setStatus('error', 'No camera found');
      showToast('No camera found on this device.', 'error');
      resetCameraUI();
      return;
    }

    // Prefer back/environment camera
    const cam = cameras.find(c => /back|environment/i.test(c.label)) || cameras[0];

    await html5QrCode.start(
      cam.id,
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => handleScan(decodedText),
      (_errorMsg) => { /* ignore frame-level errors */ }
    );
  } catch (err) {
    setStatus('error', 'Camera error');
    showToast('Camera access denied or unavailable.', 'error');
    resetCameraUI();
  }
}

async function stopCamera() {
  if (!html5QrCode) return;
  try { await html5QrCode.stop(); } catch {}
  html5QrCode.clear();
  html5QrCode = null;
  resetCameraUI();
  setStatus('', 'Inactive');
}

function resetCameraUI() {
  document.getElementById('startBtn').style.display = '';
  document.getElementById('stopBtn').style.display = 'none';
  html5QrCode = null;
}

function setStatus(type, text) {
  const dot  = document.getElementById('scannerDot');
  const span = document.getElementById('scannerStatusText');
  dot.className  = 'scanner-dot' + (type ? ' ' + type : '');
  span.textContent = text;
}

// ── Handle a decoded QR value ─────────────────────────────

let lastScannedId = null;
let lastScannedAt = 0;

function handleScan(raw) {
  // Debounce: ignore duplicate scans within 3 seconds
  const now = Date.now();
  if (raw === lastScannedId && now - lastScannedAt < 3000) return;
  lastScannedId = raw;
  lastScannedAt = now;

  // QR content format: "ASKHEALTH:<leadId>"
  let leadId = raw;
  if (raw.startsWith('ASKHEALTH:')) leadId = raw.slice('ASKHEALTH:'.length);

  processCheckIn(leadId, 'qr');
}

// ── Manual entry ──────────────────────────────────────────

document.getElementById('manualBtn').addEventListener('click', () => {
  const val = document.getElementById('manualInput').value.trim();
  if (!val) return;
  processCheckIn(val, 'manual');
  document.getElementById('manualInput').value = '';
});

document.getElementById('manualInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('manualBtn').click();
});

// ── Core check-in logic ───────────────────────────────────

function processCheckIn(identifier, source) {
  // Try direct lead ID first
  let lead = DB.getLead(identifier);

  // Try by badge number (padded or not)
  if (!lead) {
    const padded = identifier.padStart(4, '0');
    lead = DB.getLeadByBadgeNumber(padded);
  }
  if (!lead) {
    lead = DB.getLeadByBadgeNumber(identifier);
  }

  if (!lead) {
    showResult('error', identifier);
    appendLog({ type: 'notfound', id: identifier, time: new Date() });
    showToast('Lead not found.', 'error');
    updateStats();
    return;
  }

  // Check if eligible (must be confirmed or badge_sent)
  const eligible = ['confirmed', 'badge_sent'];
  if (!eligible.includes(lead.stage)) {
    showResult('warning', null, lead, 'Not in confirmed stage');
    appendLog({ type: 'notfound', lead, time: new Date(), note: 'Not confirmed' });
    showToast(`${lead.fullName} is not a confirmed attendee.`, 'error');
    return;
  }

  if (lead.checkedIn) {
    showResult('warning', null, lead, 'Already checked in');
    appendLog({ type: 'dupe', lead, time: new Date() });
    showToast(`${lead.fullName} already checked in!`, '');
    updateStats();
    return;
  }

  // Perform check-in
  const result = DB.checkInLead(lead.id, currentUser);
  if (result.ok) {
    lead = DB.getLead(lead.id); // refresh
    showResult('success', null, lead);
    appendLog({ type: 'ok', lead, time: new Date() });
    showToast(`✓ ${lead.fullName} checked in!`, 'success');
    updateStats();
    renderCheckedInTable();
  }
}

// ── Show last result card ─────────────────────────────────

function showResult(type, rawId, lead, note) {
  const wrap = document.getElementById('lastScanWrap');
  const card = document.getElementById('lastScanCard');
  wrap.style.display = '';

  const icons = {
    success: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
    warning: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    error:   `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  };
  const labels = {
    success: 'Checked In Successfully',
    warning: note || 'Already Checked In',
    error:   'Lead Not Found',
  };

  const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  card.className = `last-scan-card ${type}`;
  card.innerHTML = `
    <div class="last-scan-header ${type}">${icons[type]} ${labels[type]}</div>
    <div class="last-scan-body">
      ${lead ? `
        <div class="last-scan-name">${escHtml(lead.fullName)}</div>
        <div class="last-scan-sub">${escHtml(lead.org)} &middot; ${escHtml(lead.country)}</div>
        <div class="last-scan-sub">${escHtml(lead.interest)}</div>
        ${lead.badgeNumber ? `<div class="last-scan-badge">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/>
          </svg>
          Badge #${lead.badgeNumber}
        </div>` : ''}
        ${lead.checkedIn && lead.checkedInAt ? `<div class="last-scan-time">Check-in time: ${new Date(lead.checkedInAt).toLocaleTimeString('en-GB')}</div>` : ''}
      ` : `<div class="last-scan-sub">ID: ${escHtml(rawId || '—')}</div>`}
      <div class="last-scan-time">Scanned at ${timeStr}</div>
    </div>
  `;
}

// ── Scan log ──────────────────────────────────────────────

function appendLog(entry) {
  scanLog.unshift(entry);
  renderLog();
}

function renderLog() {
  const list = document.getElementById('scanLogList');
  if (scanLog.length === 0) {
    list.innerHTML = '<div class="scan-log-empty">No scans yet.</div>';
    return;
  }
  list.innerHTML = scanLog.slice(0, 50).map(e => {
    const time  = e.time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const label = e.lead ? escHtml(e.lead.fullName) : escHtml(e.id || '—');
    const num   = e.lead && e.lead.badgeNumber ? `#${e.lead.badgeNumber}` : '';
    const types = { ok: 'ok', dupe: 'dupe', notfound: 'notfound' };
    const msgs  = { ok: 'Checked in', dupe: 'Already in', notfound: 'Not found' };
    return `
      <div class="scan-log-item">
        <div class="scan-log-dot ${types[e.type]}"></div>
        <div class="scan-log-name">${label}</div>
        ${num ? `<div class="scan-log-num">${num}</div>` : ''}
        <div style="font-size:11px;color:var(--muted);margin:0 4px;">${msgs[e.type]}</div>
        <div class="scan-log-time">${time}</div>
      </div>`;
  }).join('');
}

function clearLog() {
  scanLog = [];
  renderLog();
}

// ── Checked-In Attendees Table ────────────────────────────

function renderCheckedInTable() {
  const leads   = DB.getLeads().filter(l => l.checkedIn);
  const users   = DB.getUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const tbody   = document.getElementById('checkedInBody');
  const countEl = document.getElementById('checkedInCount');

  countEl.textContent = `${leads.length} checked in`;

  if (leads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="checkedin-empty">No attendees checked in yet.</td></tr>';
    return;
  }

  // Sort by check-in time descending
  leads.sort((a, b) => new Date(b.checkedInAt) - new Date(a.checkedInAt));

  tbody.innerHTML = leads.map(lead => {
    const rep = lead.assignedTo ? userMap[lead.assignedTo] : null;
    const repInitials = rep ? rep.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '?';
    const repColor    = rep ? rep.color : '#94a3b8';
    const repName     = rep ? rep.name : 'Unassigned';
    const checkTime   = lead.checkedInAt
      ? new Date(lead.checkedInAt).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
      : '—';
    return `
      <tr>
        <td class="checkedin-badge-num">${lead.badgeNumber ? '#' + lead.badgeNumber : '—'}</td>
        <td style="font-weight:600;color:var(--navy);">${escHtml(lead.fullName)}</td>
        <td style="color:var(--muted);">${escHtml(lead.email)}</td>
        <td style="color:var(--muted);">${escHtml(lead.phone || '—')}</td>
        <td>${escHtml(lead.org)}</td>
        <td>${escHtml(lead.country)}</td>
        <td>${escHtml(lead.interest)}</td>
        <td>
          <div class="checkedin-rep">
            <div class="avatar-xs" style="background:${repColor}">${repInitials}</div>
            ${escHtml(repName)}
          </div>
        </td>
        <td style="color:var(--muted);">${checkTime}</td>
      </tr>`;
  }).join('');
}

// ── Export to CSV (opens in Excel) ────────────────────────

function exportCSV() {
  const leads   = DB.getLeads().filter(l => l.checkedIn);
  const users   = DB.getUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  if (leads.length === 0) {
    showToast('No checked-in attendees to export.', 'error');
    return;
  }

  leads.sort((a, b) => new Date(a.checkedInAt) - new Date(b.checkedInAt));

  const headers = ['Badge #','Full Name','Email','Phone','Organization','Country','Interest','Assigned Rep','Check-In Time'];
  const rows = leads.map(lead => {
    const rep = lead.assignedTo ? userMap[lead.assignedTo] : null;
    const checkTime = lead.checkedInAt
      ? new Date(lead.checkedInAt).toLocaleString('en-GB')
      : '';
    return [
      lead.badgeNumber || '',
      lead.fullName    || '',
      lead.email       || '',
      lead.phone       || '',
      lead.org         || '',
      lead.country     || '',
      lead.interest    || '',
      rep ? rep.name   : 'Unassigned',
      checkTime,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\r\n');
  const bom = '\uFEFF'; // UTF-8 BOM so Excel handles accented chars correctly
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `askhealth_checkins_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${leads.length} attendees.`, 'success');
}

// ── HTML escape ───────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
