/* =========================================================
   ASKHEALTH CRM — badges.js
   Badge preview with QR codes + print functionality.
   ========================================================= */

let session;

DB.init().then(function() {
  if (!Auth.requireLogin()) return;
  session = DB.getSession();
  renderSidebar('badges');
  buildTopbarRight();
  renderBadges();
});

// ── Info panel items (matches screenshot) ─────────────────
const INFO_ITEMS = [
  {
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
    text: 'Print your PDF badge and bring it with you to scan the barcode at turnstiles. Easily access exhibition halls without waiting in a queue.'
  },
  {
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    text: 'Presenting your business card at the entrance is required.'
  },
  {
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M12 12v4M10 14h4"/></svg>`,
    text: 'You can get free lanyards at the entrance to wear your badge at all times. Entry and exit without a badge is not possible.'
  },
  {
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    text: 'Physical badge is also available by scanning your digital badge via self service kiosks.'
  },
  {
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    text: 'This badge is strictly personal and cannot be used by someone else or cannot be transferred.'
  },
];

document.getElementById('badgeSearch').addEventListener('input', renderBadges);
document.getElementById('printAllBtn').addEventListener('click', printAll);

// ── Top bar user ──────────────────────────────────────────

function buildTopbarRight() {
  const el = document.getElementById('topbarRight');
  const initials = session.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  el.innerHTML = `
    <div class="avatar" style="background:${session.color || '#1A6FA3'}">${initials}</div>
    <span style="font-size:13px;font-weight:600;color:#334155;">${session.name}</span>
    <span class="role-badge ${session.role}">${session.role === 'admin' ? 'Admin' : 'Rep'}</span>
  `;
}

// ── Get eligible leads ────────────────────────────────────

function getConfirmedLeads() {
  const query = document.getElementById('badgeSearch').value.toLowerCase();
  const eligible = ['confirmed', 'badge_sent'];
  let leads = session.role === 'admin'
    ? DB.getLeads().filter(l => eligible.includes(l.stage))
    : DB.getLeadsForUser(session.userId).filter(l => eligible.includes(l.stage));
  if (query) {
    leads = leads.filter(l =>
      (l.fullName || '').toLowerCase().includes(query) ||
      (l.org      || '').toLowerCase().includes(query) ||
      (l.country  || '').toLowerCase().includes(query)
    );
  }
  return leads;
}

// ── QR code generation ────────────────────────────────────

function generateQR(leadId) {
  return new Promise((resolve) => {
    if (typeof QRCode === 'undefined') { resolve(null); return; }
    try {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
      document.body.appendChild(div);
      new QRCode(div, {
        text: 'ASKHEALTH:' + leadId,
        width: 160,
        height: 160,
        colorDark: '#0F2D45',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      // qrcodejs renders synchronously to canvas/img; read after a short tick
      setTimeout(() => {
        const canvas = div.querySelector('canvas');
        const img    = div.querySelector('img');
        let dataUrl  = null;
        if (canvas) dataUrl = canvas.toDataURL('image/png');
        else if (img) dataUrl = img.src;
        document.body.removeChild(div);
        resolve(dataUrl);
      }, 50);
    } catch (e) {
      console.warn('QR generation failed:', e);
      resolve(null);
    }
  });
}

// ── Render badge grid ─────────────────────────────────────

async function renderBadges() {
  const leads   = getConfirmedLeads();
  const grid    = document.getElementById('badgesGrid');
  const summary = document.getElementById('badgesSummary');

  // Ensure badge numbers are assigned
  leads.forEach(l => { if (!l.badgeNumber) DB.generateBadgeNumber(l); });

  summary.innerHTML = `<strong>${leads.length}</strong> confirmed attendee${leads.length !== 1 ? 's' : ''}`;
  grid.innerHTML = '';

  if (leads.length === 0) {
    grid.innerHTML = `
      <div class="badges-empty">
        <svg width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M12 12v4M10 14h4"/>
        </svg>
        <h3>No confirmed attendees yet</h3>
        <p>Move leads to "Confirmed Attendance" on the Kanban board to generate badges.</p>
      </div>`;
    return;
  }

  try {
    for (const lead of leads) {
      const qrDataUrl = await generateQR(lead.id);
      const wrap = document.createElement('div');
      wrap.className = 'badge-card-wrap';
      wrap.innerHTML = buildPreviewHTML(lead, qrDataUrl);
      grid.appendChild(wrap);
    }
  } catch (e) {
    console.error('renderBadges failed:', e);
    grid.innerHTML = `<div class="badges-empty"><h3>Error rendering badges</h3><p>${e.message}</p></div>`;
  }
}

// ── Build screen preview HTML ─────────────────────────────

function buildPreviewHTML(lead, qrDataUrl) {
  const infoItemsHtml = INFO_ITEMS.map(item => `
    <div class="badge-info-item">
      <div class="badge-info-icon">${item.icon}</div>
      <div class="badge-info-text">${item.text}</div>
    </div>
  `).join('');

  const checkedInBadge = lead.checkedIn
    ? `<span class="lead-tag" style="background:#F0FFF4;color:#276749;font-size:11px;">✓ Checked In</span>`
    : '';

  return `
    <div class="badge-preview-card">
      <!-- Left: instructions -->
      <div class="badge-left">
        <div class="badge-left-title">Your Entry Badge</div>
        ${infoItemsHtml}
      </div>
      <!-- Right: attendee info -->
      <div class="badge-right">
        <div class="badge-right-logo">
          <div class="badge-right-logo-text">ASKHEALTH</div>
          <div class="badge-right-logo-sub">Healthcare B2B Event &bull; Morocco</div>
        </div>
        <div class="badge-attendee-name">${escHtml(lead.fullName)}</div>
        <div class="badge-attendee-org">${escHtml(lead.org)}</div>
        <div class="badge-attendee-country">${escHtml(lead.country)}</div>
        <div class="badge-qr-wrap">
          ${qrDataUrl
            ? `<img src="${qrDataUrl}" alt="QR Code" style="width:88px;height:88px;">`
            : `<div style="width:88px;height:88px;border:1px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;text-align:center;border-radius:4px;">QR N/A</div>`
          }
        </div>
        <div class="badge-right-footer">Healthcare B2B Event &bull; Morocco</div>
      </div>
    </div>
    <div class="badge-card-actions">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="badge-num">#${lead.badgeNumber}</span>
        ${checkedInBadge}
      </div>
      <div style="display:flex;gap:6px;">
        ${lead.stage !== 'badge_sent' ? `
          <button class="btn btn-ghost btn-sm" onclick="markBadgeSent('${lead.id}')">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Mark Sent
          </button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="printSingle('${lead.id}')">
          <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print Badge
        </button>
      </div>
    </div>
  `;
}

// ── Build a single print-card HTML string ─────────────────

function buildPrintCardHTML(lead, qrDataUrl) {
  const infoItemsPrintHtml = INFO_ITEMS.map(item => `
    <div class="badge-print-info-item">
      <span class="badge-print-info-text">&bull; ${item.text}</span>
    </div>
  `).join('');

  return `
    <div class="badge-print-card">
      <!-- Left info panel -->
      <div class="badge-print-left">
        <div class="badge-print-left-title">Your Entry Badge</div>
        ${infoItemsPrintHtml}
      </div>
      <!-- Right attendee panel -->
      <div class="badge-print-right">
        <div>
          <div class="badge-print-logo-text">ASKHEALTH</div>
          <div class="badge-print-logo-sub">Healthcare B2B Event &bull; Morocco</div>
        </div>
        <div class="badge-print-name">${escHtml(lead.fullName)}</div>
        <div class="badge-print-org">${escHtml(lead.org)}</div>
        <div class="badge-print-country">${escHtml(lead.country)}</div>
        ${qrDataUrl ? `<img class="badge-print-qr" src="${qrDataUrl}" alt="QR">` : ''}
        <div class="badge-print-footer">Healthcare B2B Event &bull; Morocco</div>
      </div>
    </div>
  `;
}

// ── Print single badge ────────────────────────────────────

async function printSingle(leadId) {
  const lead = DB.getLead(leadId);
  if (!lead) return;
  if (!lead.badgeNumber) DB.generateBadgeNumber(lead);
  const qrDataUrl = await generateQR(lead.id);
  const area = document.getElementById('print-area');
  area.innerHTML = `<div class="badge-print-page">${buildPrintCardHTML(lead, qrDataUrl)}</div>`;
  window.print();
  area.innerHTML = '';
}

// ── Print all badges ──────────────────────────────────────

async function printAll() {
  const leads = getConfirmedLeads();
  if (leads.length === 0) {
    showToast('No confirmed attendees to print.', 'error');
    return;
  }

  showToast('Preparing badges…');

  // Generate all QR codes first
  const cards = await Promise.all(leads.map(async lead => {
    if (!lead.badgeNumber) DB.generateBadgeNumber(lead);
    const qrDataUrl = await generateQR(lead.id);
    return buildPrintCardHTML(lead, qrDataUrl);
  }));

  const area = document.getElementById('print-area');
  area.innerHTML = `<div class="badge-print-page">${cards.join('')}</div>`;
  window.print();
  area.innerHTML = '';
}

// ── Mark badge sent ───────────────────────────────────────

function markBadgeSent(leadId) {
  const lead = DB.getLead(leadId);
  if (!lead || lead.stage === 'badge_sent') return;
  DB.moveLeadStage(leadId, 'badge_sent', DB.getUser(session.userId));
  renderBadges();
  showToast('Badge marked as sent!', 'success');
}

// ── HTML escape ───────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
