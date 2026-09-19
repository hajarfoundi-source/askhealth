/* =========================================================
   ASKHEALTH CRM — kanban.js
   ========================================================= */

let session, currentUser, searchQuery = '', activePanelLeadId = null, currentView = 'kanban';
let showAll = false;
const isMobile = () => window.innerWidth <= 768;

DB.init().then(function() {
  if (!Auth.requireLogin()) return;

  session = DB.getSession();
  currentUser = DB.getUser(session.userId);
  showAll = session.role === 'admin';

  // Default to card view on mobile
  if (isMobile()) currentView = 'cards';

  renderSidebar('kanban');
  buildToolbar();
  buildTopbarRight();

  if (currentView === 'cards') {
    document.getElementById('boardWrap').style.display = 'none';
    document.getElementById('cardsWrap').style.display = '';
    renderCards();
  } else {
    renderBoard();
  }
});

// ── Toolbar ───────────────────────────────────────────────

function buildToolbar() {
  const sub     = document.getElementById('subtoolbar');
  const isAdmin = session.role === 'admin';

  // All controls go in the subtoolbar (below the topbar)
  let html = `
    <div class="search-wrap">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" class="form-control" id="searchInput" placeholder="Search leads…" style="height:30px;font-size:12px;">
    </div>
    <div class="filter-toggle">
      <button class="filter-btn ${currentView === 'kanban' ? 'active' : ''}" id="btnKanban" onclick="setView('kanban')" title="Board view">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/></svg>
        Board
      </button>
      <button class="filter-btn ${currentView === 'cards' ? 'active' : ''}" id="btnCards" onclick="setView('cards')" title="Cards view">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="7" rx="1"/><rect x="2" y="14" width="20" height="7" rx="1"/></svg>
        Cards
      </button>
      <button class="filter-btn ${currentView === 'list' ? 'active' : ''}" id="btnList" onclick="setView('list')" title="List view">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        List
      </button>
    </div>
  `;

  if (isAdmin) {
    html += `
      <div class="filter-toggle" id="allMineToggle">
        <button class="filter-btn ${showAll ? 'active' : ''}" id="btnAll" onclick="setFilter(true)">All</button>
        <button class="filter-btn ${!showAll ? 'active' : ''}" id="btnMine" onclick="setFilter(false)">Mine</button>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openNewLead()">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Lead
      </button>
    `;
  }

  sub.innerHTML = html;

  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    if (currentView === 'list') renderList();
    else if (currentView === 'cards') renderCards();
    else renderBoard();
  });
}

// Re-render when Firebase syncs fresh data (fixes "No leads" on first mobile load)
window.addEventListener('db-synced', function() {
  if (!session) return;
  currentUser = DB.getUser(session.userId);
  if (currentView === 'cards') renderCards();
  else if (currentView === 'list') renderList();
  else renderBoard();
  buildTopbarRight();
});

function setView(view) {
  currentView = view;
  const btnKanban = document.getElementById('btnKanban');
  const btnCards  = document.getElementById('btnCards');
  const btnList   = document.getElementById('btnList');
  if (btnKanban) btnKanban.classList.toggle('active', view === 'kanban');
  if (btnCards)  btnCards.classList.toggle('active',  view === 'cards');
  if (btnList)   btnList.classList.toggle('active',   view === 'list');
  document.getElementById('boardWrap').style.display  = view === 'kanban' ? '' : 'none';
  document.getElementById('cardsWrap').style.display  = view === 'cards'  ? '' : 'none';
  document.getElementById('listWrap').style.display   = view === 'list'   ? '' : 'none';
  if (view === 'list')   renderList();
  else if (view === 'cards') renderCards();
  else renderBoard();
}

function buildTopbarRight() {
  const el = document.getElementById('topbarRight');
  const initials = session.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  el.innerHTML = `
    <div class="avatar" style="background:${session.color || '#1A6FA3'}">${initials}</div>
    <span style="font-size:13px;font-weight:600;color:#334155;">${session.name}</span>
    <span class="role-badge ${session.role}">${session.role === 'admin' ? 'Admin' : 'Rep'}</span>
  `;
}

function setFilter(all) {
  showAll = all;
  document.getElementById('btnAll').classList.toggle('active', all);
  document.getElementById('btnMine').classList.toggle('active', !all);
  if (currentView === 'list') renderList();
  else if (currentView === 'cards') renderCards();
  else renderBoard();
}

// ── Board render ──────────────────────────────────────────

function getVisibleLeads() {
  let leads = showAll ? DB.getLeads() : DB.getLeadsForUser(session.userId);
  if (searchQuery) {
    leads = leads.filter(l =>
      (l.fullName  || '').toLowerCase().includes(searchQuery) ||
      (l.email     || '').toLowerCase().includes(searchQuery) ||
      (l.org       || '').toLowerCase().includes(searchQuery)
    );
  }
  return leads;
}

function renderBoard() {
  const board  = document.getElementById('board');
  const leads  = getVisibleLeads();
  const users  = DB.getUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  board.innerHTML = '';

  DB.STAGES.forEach(stage => {
    const stageLeads = leads.filter(l => l.stage === stage.id);
    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.stage = stage.id;
    col.style.borderTopColor = stage.color;

    col.innerHTML = `
      <div class="column-header">
        <span class="column-title">${stage.label}</span>
        <span class="column-count">${stageLeads.length}</span>
      </div>
      <div class="column-cards" id="col_${stage.id}">
        ${stageLeads.length === 0 ? '<div class="empty-col">No leads</div>' : ''}
      </div>
    `;

    // Drop zone events
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const leadId = e.dataTransfer.getData('text/plain');
      if (leadId) {
        DB.moveLeadStage(leadId, stage.id, currentUser);
        renderBoard();
        if (activePanelLeadId === leadId) openPanel(leadId);
        showToast(`Moved to "${stage.label}"`, 'success');
      }
    });

    board.appendChild(col);

    const cardsEl = col.querySelector('.column-cards');
    stageLeads.forEach(lead => {
      const card = buildCard(lead, stage, userMap);
      cardsEl.appendChild(card);
    });
  });
}

function buildCard(lead, stage, userMap) {
  const card = document.createElement('div');
  card.className = 'lead-card';
  card.style.borderLeftColor = stage.color;
  card.dataset.id = lead.id;
  card.draggable = true;

  const rep = lead.assignedTo ? userMap[lead.assignedTo] : null;
  const repInitials = rep ? rep.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '?';
  const repColor = rep ? rep.color : '#94a3b8';
  const date = new Date(lead.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
  const notesCount = (lead.notes || []).length;

  card.innerHTML = `
    <div class="lead-card-top">
      <div class="lead-card-name truncate">${escHtml(lead.fullName)}</div>
      <div class="avatar avatar-sm" style="background:${repColor}" title="${rep ? rep.name : 'Unassigned'}">${repInitials}</div>
    </div>
    <div class="lead-card-org truncate">${escHtml(lead.org || '—')}</div>
    <div class="lead-card-tags">
      ${lead.country ? `<span class="lead-tag">${escHtml(lead.country)}</span>` : ''}
      ${lead.interest ? `<span class="lead-tag">${escHtml(lead.interest)}</span>` : ''}
    </div>
    <div class="lead-card-footer">
      <span class="lead-card-date">${date}</span>
      <div class="lead-card-meta">
        ${notesCount > 0 ? `<span class="notes-badge">
          <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ${notesCount}
        </span>` : ''}
        ${lead.badgeNumber ? `<span class="lead-tag" style="background:#FEF3C7;color:#92400E;">#${lead.badgeNumber}</span>` : ''}
      </div>
    </div>
  `;

  // Drag events
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => card.classList.add('dragging'), 0);
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  // Click to open panel
  card.addEventListener('click', () => openPanel(lead.id));

  return card;
}

// ── Cards view (mobile single-column) ────────────────────

function renderCards() {
  const wrap  = document.getElementById('cardsWrap');
  const leads = getVisibleLeads();
  const users = DB.getUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  if (leads.length === 0) {
    wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:13px;">No leads found.</div>';
    return;
  }

  const sorted = leads.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  wrap.innerHTML = sorted.map(lead => {
    const stage = DB.STAGES.find(s => s.id === lead.stage) || { label: lead.stage, color: '#94a3b8' };
    const rep = lead.assignedTo ? userMap[lead.assignedTo] : null;
    const repInitials = rep ? rep.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
    const repColor = rep ? rep.color : '#94a3b8';
    const date = new Date(lead.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

    return `
      <div class="mobile-card" style="border-left-color:${stage.color}" onclick="openPanel('${lead.id}')">
        <div class="mobile-card-top">
          <div class="mobile-card-name">${escHtml(lead.fullName)}</div>
          <span class="mobile-card-stage" style="background:${stage.color}22;color:${stage.color};border:1px solid ${stage.color}44;">${escHtml(stage.label)}</span>
        </div>
        <div class="mobile-card-org">${escHtml(lead.org || '—')}</div>
        <div class="mobile-card-tags">
          ${lead.country  ? `<span class="lead-tag">${escHtml(lead.country)}</span>` : ''}
          ${lead.interest ? `<span class="lead-tag">${escHtml(lead.interest)}</span>` : ''}
        </div>
        <div class="mobile-card-footer">
          <div class="mobile-card-rep">
            <div class="avatar avatar-sm" style="background:${repColor}">${repInitials}</div>
            <span>${rep ? escHtml(rep.name) : 'Unassigned'}</span>
          </div>
          <span>${date}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── Lead detail side panel ────────────────────────────────

function openPanel(leadId) {
  activePanelLeadId = leadId;
  const lead = DB.getLead(leadId);
  if (!lead) return;

  const overlay = document.getElementById('panelOverlay');
  const body    = document.getElementById('panelBody');
  const nameEl  = document.getElementById('panelName');
  const isAdmin = session.role === 'admin';
  const users   = DB.getUsers();
  const repUser = lead.assignedTo ? DB.getUser(lead.assignedTo) : null;

  nameEl.textContent = lead.fullName;

  // Stage options
  const stageOptions = DB.STAGES.map(s =>
    `<option value="${s.id}" ${lead.stage === s.id ? 'selected' : ''}>${s.label}</option>`
  ).join('');

  // Rep options (admin only)
  const repOptions = users.map(u =>
    u.role === 'rep' ? `<option value="${u.id}" ${lead.assignedTo === u.id ? 'selected' : ''}>${escHtml(u.name)}</option>` : ''
  ).join('');
  const repSelectHtml = isAdmin
    ? `<select class="stage-select" id="repSelect"><option value="">Unassigned</option>${repOptions}</select>`
    : `<span class="lead-field-value">${repUser ? escHtml(repUser.name) : '<span style="color:var(--muted)">Unassigned</span>'}</span>`;

  // Notes
  const notesHtml = (lead.notes || []).length === 0
    ? '<p style="color:var(--muted);font-size:12px;">No notes yet.</p>'
    : (lead.notes || []).slice().reverse().map(n => `
        <div class="note-item">
          <div class="note-meta">${escHtml(n.authorName)} · ${fmtDate(n.createdAt)}</div>
          <div class="note-text">${escHtml(n.text)}</div>
        </div>
      `).join('');

  // History
  const histHtml = (lead.history || []).slice().reverse().slice(0, 12).map(h => {
    let desc = '';
    if (h.type === 'created')       desc = 'Lead created';
    else if (h.type === 'stage_change') {
      const from = DB.STAGES.find(s => s.id === h.from);
      const to   = DB.STAGES.find(s => s.id === h.to);
      desc = `Stage: ${from ? from.label : h.from} → ${to ? to.label : h.to}`;
    }
    else if (h.type === 'note_added') desc = 'Note added';
    else if (h.type === 'assigned')   desc = `Assigned to ${h.toName || '?'}`;
    else if (h.type === 'badge_generated') desc = `Badge #${h.badge} generated`;
    return `<div class="history-item"><div class="history-dot"></div><div>${escHtml(desc)} <span style="float:right;color:#94a3b8;">${fmtDate(h.at)}</span></div></div>`;
  }).join('');

  body.innerHTML = `
    <!-- Contact info -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Contact</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="lead-field"><span class="lead-field-label">Email</span><span class="lead-field-value" style="word-break:break-all;">${escHtml(lead.email)}</span></div>
        <div class="lead-field"><span class="lead-field-label">Phone</span><span class="lead-field-value">${lead.phone ? escHtml(lead.phone) : '<span style="color:var(--muted)">—</span>'}</span></div>
        <div class="lead-field"><span class="lead-field-label">Organization</span><span class="lead-field-value">${escHtml(lead.org)}</span></div>
        <div class="lead-field"><span class="lead-field-label">Country</span><span class="lead-field-value">${escHtml(lead.country)}</span></div>
        <div class="lead-field"><span class="lead-field-label">Interest</span><span class="lead-field-value">${escHtml(lead.interest)}</span></div>
      </div>
      ${lead.message ? `<div class="lead-field" style="margin-top:6px;"><span class="lead-field-label">Message</span><span class="lead-field-value" style="white-space:pre-wrap;">${escHtml(lead.message)}</span></div>` : ''}
    </div>

    <!-- Pipeline -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Pipeline</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start;">
        <div class="lead-field">
          <span class="lead-field-label">Stage</span>
          ${isAdmin ? `<select class="stage-select" id="stageSelect">${stageOptions}</select>` : `<span class="lead-field-value">${DB.STAGES.find(s=>s.id===lead.stage)?.label || lead.stage}</span>`}
        </div>
        <div class="lead-field">
          <span class="lead-field-label">Assigned To</span>
          ${repSelectHtml}
        </div>
        ${lead.badgeNumber ? `<div class="lead-field"><span class="lead-field-label">Badge #</span><span class="lead-field-value" style="color:var(--gold);font-weight:700;">${lead.badgeNumber}</span></div>` : ''}
        <div class="lead-field"><span class="lead-field-label">Created</span><span class="lead-field-value" style="font-size:12px;">${fmtDate(lead.createdAt)}</span></div>
      </div>
    </div>

    <!-- Notes -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Notes</div>
      <div class="notes-list" id="notesList">${notesHtml}</div>
      <div class="note-input-row" style="margin-top:8px;">
        <textarea class="form-control" id="noteInput" placeholder="Add a note…"></textarea>
        <button class="btn btn-teal btn-sm" style="height:36px;" onclick="submitNote('${leadId}')">Add</button>
      </div>
    </div>

    <!-- History -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">History</div>
      <div class="history-list">${histHtml || '<p style="color:var(--muted);font-size:12px;">No history.</p>'}</div>
    </div>
  `;

  // Stage change listener
  if (isAdmin) {
    document.getElementById('stageSelect').addEventListener('change', e => {
      DB.moveLeadStage(leadId, e.target.value, currentUser);
      renderBoard();
      openPanel(leadId); // re-render panel
      showToast('Stage updated', 'success');
    });

    // Rep assignment listener
    document.getElementById('repSelect').addEventListener('change', e => {
      const lead = DB.getLead(leadId);
      if (!lead) return;
      const newRepId = e.target.value || null;
      const newRep   = newRepId ? DB.getUser(newRepId) : null;
      lead.assignedTo = newRepId;
      lead.history = lead.history || [];
      lead.history.push({
        type: 'assigned', byId: currentUser.id, byName: currentUser.name,
        to: newRepId, toName: newRep ? newRep.name : 'Unassigned',
        at: new Date().toISOString(),
      });
      DB.saveLead(lead);
      renderBoard();
      openPanel(leadId);
      showToast(newRep ? `Assigned to ${newRep.name}` : 'Unassigned', 'success');
    });
  }

  overlay.classList.add('open');
}

function closePanel() {
  activePanelLeadId = null;
  document.getElementById('panelOverlay').classList.remove('open');
}

function submitNote(leadId) {
  const input = document.getElementById('noteInput');
  const text  = input.value.trim();
  if (!text) return;
  DB.addNote(leadId, currentUser, text);
  input.value = '';
  openPanel(leadId);
  showToast('Note added', 'success');
}

// Panel close events
document.getElementById('panelClose').addEventListener('click', closePanel);
document.getElementById('panelBackdrop').addEventListener('click', closePanel);

// ── New Lead modal ────────────────────────────────────────

function openNewLead() {
  document.getElementById('newLeadOverlay').classList.add('open');
  document.getElementById('nl_name').focus();
}

function closeNewLead() {
  document.getElementById('newLeadOverlay').classList.remove('open');
  ['nl_name','nl_email','nl_phone','nl_org','nl_message'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('nl_country').selectedIndex = 0;
  document.getElementById('nl_interest').selectedIndex = 0;
}

document.getElementById('newLeadClose').addEventListener('click', closeNewLead);
document.getElementById('newLeadCancel').addEventListener('click', closeNewLead);
document.getElementById('newLeadOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('newLeadOverlay')) closeNewLead();
});

document.getElementById('newLeadSubmit').addEventListener('click', () => {
  const name    = document.getElementById('nl_name').value.trim();
  const email   = document.getElementById('nl_email').value.trim();
  const phone   = document.getElementById('nl_phone').value.trim();
  const org     = document.getElementById('nl_org').value.trim();
  const country = document.getElementById('nl_country').value;
  const interest= document.getElementById('nl_interest').value;
  const message = document.getElementById('nl_message').value.trim();

  if (!name || !email || !org || !country || !interest) {
    showToast('Please fill all required fields.', 'error');
    return;
  }

  DB.createLead({ fullName: name, email, phone, org, country, interest, message }, currentUser);
  closeNewLead();
  renderBoard();
  showToast('Lead added and assigned!', 'success');
});

// ── List view ─────────────────────────────────────────────

function renderList() {
  const leads   = getVisibleLeads();
  const users   = DB.getUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const tbody   = document.getElementById('listBody');
  const countEl = document.getElementById('listCount');

  countEl.textContent = `${leads.length} lead${leads.length !== 1 ? 's' : ''}`;

  if (leads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--muted);font-size:13px;">No leads found.</td></tr>';
    return;
  }

  // Sort by created date descending
  const sorted = leads.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  tbody.innerHTML = sorted.map(lead => {
    const stage = DB.STAGES.find(s => s.id === lead.stage) || { label: lead.stage, color: '#94a3b8' };
    const rep   = lead.assignedTo ? userMap[lead.assignedTo] : null;
    const repInitials = rep ? rep.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
    const date  = new Date(lead.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    return `<tr class="list-row" onclick="openPanel('${lead.id}')">
      <td class="list-name">${escHtml(lead.fullName)}</td>
      <td class="list-muted">${escHtml(lead.email)}</td>
      <td class="list-muted">${escHtml(lead.phone || '—')}</td>
      <td>${escHtml(lead.org)}</td>
      <td class="list-muted">${escHtml(lead.country)}</td>
      <td class="list-muted">${escHtml(lead.interest)}</td>
      <td><span class="list-stage-badge" style="background:${stage.color}22;color:${stage.color};border:1px solid ${stage.color}44;">${escHtml(stage.label)}</span></td>
      <td>
        ${rep
          ? `<div class="list-rep"><div class="avatar avatar-sm" style="background:${rep.color}">${repInitials}</div><span>${escHtml(rep.name)}</span></div>`
          : `<span style="color:var(--muted)">Unassigned</span>`}
      </td>
      <td style="color:var(--gold);font-weight:700;">${lead.badgeNumber ? '#' + lead.badgeNumber : '—'}</td>
      <td class="list-muted" style="white-space:nowrap;">${date}</td>
    </tr>`;
  }).join('');
}

function exportLeadsCSV() {
  const leads   = getVisibleLeads();
  const users   = DB.getUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  if (leads.length === 0) {
    showToast('No leads to export.', 'error');
    return;
  }

  const sorted = leads.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const headers = ['Full Name','Email','Phone','Organization','Country','Area of Interest','Stage','Assigned Rep','Badge #','Created Date','Message'];
  const rows = sorted.map(lead => {
    const stage = DB.STAGES.find(s => s.id === lead.stage);
    const rep   = lead.assignedTo ? userMap[lead.assignedTo] : null;
    return [
      lead.fullName  || '',
      lead.email     || '',
      lead.phone     || '',
      lead.org       || '',
      lead.country   || '',
      lead.interest  || '',
      stage ? stage.label : lead.stage,
      rep ? rep.name : 'Unassigned',
      lead.badgeNumber || '',
      lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-GB') : '',
      lead.message   || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv  = [headers.join(','), ...rows].join('\r\n');
  const bom  = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `askhealth_leads_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${sorted.length} leads.`, 'success');
}

// ── Helpers ───────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
