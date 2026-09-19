/* =========================================================
   ASKHEALTH CRM — exhibitors.js
   Exhibitor pipeline management (Kanban + List views).
   ========================================================= */

let session, currentUser, isAdmin, isComRep;
let viewMode = window.innerWidth <= 768 ? 'cards' : 'kanban';
let filterPack = '';
let searchQ = '';
let openPanelId = null;

DB.init().then(function() {
  if (!Auth.requireLogin()) return;

  session     = DB.getSession();
  currentUser = DB.getUser(session.userId);
  isAdmin     = Auth.isAdmin();
  isComRep    = Auth.isComRep();

  if (!isAdmin && !isComRep) {
    window.location.href = 'kanban.html';
    return;
  }

  renderSidebar('exhibitors');
  buildTopbarRight();
  buildToolbar();

  // Explicitly show the correct view (matches kanban.js pattern)
  if (viewMode === 'cards') {
    var bw = document.getElementById('boardWrap');
    var lw = document.getElementById('listWrap');
    var cw = document.getElementById('cardsWrap');
    if (bw) bw.style.display = 'none';
    if (lw) lw.style.display = 'none';
    if (cw) { cw.style.display = 'flex'; cw.style.flexDirection = 'column'; }
    renderCards();
  } else {
    switchView(viewMode);
  }
});

// Re-render when Firebase syncs
window.addEventListener('db-synced', function() {
  if (!session) return;
  if (viewMode === 'cards') renderCards();
  else if (viewMode === 'list') renderList();
  else renderBoard();
});

// ── Topbar right ──────────────────────────────────────────

function buildTopbarRight() {
  const el = document.getElementById('topbarRight');
  const initials = session.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const roleLabel = isAdmin ? 'Admin' : 'Com. Rep';
  const roleCls   = isAdmin ? 'admin' : 'com_rep';
  el.innerHTML = `
    <div class="avatar" style="background:${session.color || '#D4A843'}">${initials}</div>
    <span style="font-size:13px;font-weight:600;color:#334155;">${escHtml(session.name)}</span>
    <span class="role-badge ${roleCls}">${roleLabel}</span>
  `;
}

// ── Toolbar (subtoolbar) ──────────────────────────────────

function buildToolbar() {
  const sub = document.getElementById('subtoolbar');
  sub.innerHTML = `
    <div class="search-wrap">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="form-control" style="height:30px;font-size:12px;" type="text" id="searchInput" placeholder="Search institution…">
    </div>
    <div class="view-toggle">
      <button id="btnBoard" onclick="switchView('kanban')" ${viewMode==='kanban'?'class="active"':''}>
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/></svg>
        Board
      </button>
      <button id="btnCards" onclick="switchView('cards')" ${viewMode==='cards'?'class="active"':''}>
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/></svg>
        Cards
      </button>
      <button id="btnList" onclick="switchView('list')" ${viewMode==='list'?'class="active"':''}>
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        List
      </button>
    </div>
    <select class="filter-select" onchange="handlePackFilter(this.value)">
      <option value="">All Packs</option>
      <option value="premium">Premium</option>
      <option value="gold">Gold</option>
      <option value="regular">Regular</option>
    </select>
    ${isAdmin ? `
    <button class="btn btn-primary btn-sm" onclick="openNewExhibitorModal()">
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Exhibitor
    </button>` : ''}
  `;
  document.getElementById('searchInput').addEventListener('input', function() {
    handleSearch(this.value);
  });
}

// ── Data helpers ──────────────────────────────────────────

function getVisibleExhibitors() {
  let exs = DB.getExhibitors();
  if (!isAdmin) exs = exs.filter(e => e.assignedTo === session.userId);
  if (filterPack) exs = exs.filter(e => e.pack === filterPack);
  if (searchQ) {
    const q = searchQ.toLowerCase();
    exs = exs.filter(e =>
      (e.institutionName||'').toLowerCase().includes(q) ||
      (e.contactPerson||'').toLowerCase().includes(q) ||
      (e.city||'').toLowerCase().includes(q)
    );
  }
  return exs;
}

// ── Kanban Board ──────────────────────────────────────────

function renderBoard() {
  const board = document.getElementById('board');
  const exs   = getVisibleExhibitors();
  board.innerHTML = '';

  DB.EXHIBITOR_STAGES.forEach(stage => {
    const stageExs = exs.filter(e => e.stage === stage.id);
    const col = document.createElement('div');
    col.className = 'kanban-col';
    col.innerHTML = `
      <div class="col-header">
        <div class="col-title">
          <span class="col-dot" style="background:${stage.color}"></span>
          ${escHtml(stage.label)}
        </div>
        <span class="col-count">${stageExs.length}</span>
      </div>
      <div class="col-cards" id="col_${stage.id}" data-stage="${stage.id}"></div>
    `;
    board.appendChild(col);

    const cardsEl = col.querySelector('.col-cards');
    stageExs.forEach(ex => cardsEl.appendChild(buildCard(ex)));

    // Drag over / drop handlers
    cardsEl.addEventListener('dragover', e => { e.preventDefault(); cardsEl.classList.add('drag-over'); });
    cardsEl.addEventListener('dragleave', () => cardsEl.classList.remove('drag-over'));
    cardsEl.addEventListener('drop', e => {
      e.preventDefault();
      cardsEl.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      DB.moveExhibitorStage(id, stage.id, currentUser);
      renderBoard();
      if (openPanelId === id) openPanel(id);
    });
  });
}

function buildCard(ex) {
  const card = document.createElement('div');
  card.className = 'ex-card';
  card.draggable = true;
  card.dataset.id = ex.id;

  const packClass = ex.pack || 'none';
  const packText  = ex.pack ? (ex.pack.charAt(0).toUpperCase() + ex.pack.slice(1)) : 'No pack';
  const rep = ex.assignedTo ? DB.getUser(ex.assignedTo) : null;
  const repInitials = rep ? rep.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '?';

  card.innerHTML = `
    <div class="ex-card-top">
      <div class="ex-card-name">${escHtml(ex.institutionName)}</div>
      <span class="pack-badge-card ${packClass}">${escHtml(packText)}</span>
    </div>
    <div class="ex-card-contact">${escHtml(ex.contactPerson)} · ${escHtml(ex.city)}</div>
    <div class="ex-card-tags">
      ${ex.specialty ? `<span class="ex-tag">${escHtml(ex.specialty)}</span>` : ''}
    </div>
    <div class="ex-card-footer">
      <span class="ex-card-price">${ex.totalPrice ? '$' + ex.totalPrice.toLocaleString('en-US') : ex.packPrice ? '$' + ex.packPrice.toLocaleString('en-US') : '—'}</span>
      <span class="ex-card-meta">
        <div class="avatar avatar-sm" style="background:${rep ? rep.color : '#64748B'}">${repInitials}</div>
        ${ex.attendees ? ex.attendees.length + ' att.' : '—'}
      </span>
    </div>
  `;

  card.addEventListener('click', () => openPanel(ex.id));
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', ex.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  return card;
}

// ── List View ─────────────────────────────────────────────

function renderList() {
  const exs = getVisibleExhibitors();
  document.getElementById('listCount').textContent = exs.length + ' exhibitor' + (exs.length !== 1 ? 's' : '');
  const tbody = document.getElementById('listBody');
  tbody.innerHTML = '';

  exs.forEach(ex => {
    const rep   = ex.assignedTo ? DB.getUser(ex.assignedTo) : null;
    const stage = DB.EXHIBITOR_STAGES.find(s => s.id === ex.stage);
    const tr = document.createElement('tr');
    tr.onclick = () => openPanel(ex.id);
    tr.innerHTML = `
      <td><strong>${escHtml(ex.institutionName)}</strong></td>
      <td>${escHtml(ex.contactPerson)}</td>
      <td>${escHtml(ex.specialty || '—')}</td>
      <td>${ex.pack ? `<span class="pack-badge-card ${ex.pack}" style="display:inline-block">${escHtml(ex.pack.charAt(0).toUpperCase()+ex.pack.slice(1))}</span>` : '—'}</td>
      <td>${ex.attendees ? ex.attendees.length : '—'}</td>
      <td>${ex.totalPrice ? '$' + ex.totalPrice.toLocaleString('en-US') : ex.packPrice ? '$' + ex.packPrice.toLocaleString('en-US') : '—'}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${(stage ? stage.color : '#64748B') + '22'};color:${stage ? stage.color : '#64748B'}">${escHtml(stage ? stage.label : ex.stage)}</span></td>
      <td>${rep ? `<div style="display:flex;align-items:center;gap:6px;"><div class="avatar avatar-sm" style="background:${rep.color}">${rep.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div> ${escHtml(rep.name)}</div>` : '—'}</td>
      <td style="color:var(--muted);">${new Date(ex.createdAt).toLocaleDateString('en-GB')}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Cards view (mobile-friendly) ─────────────────────────

function renderCards() {
  const wrap = document.getElementById('cardsWrap');
  const exs  = getVisibleExhibitors();
  wrap.innerHTML = '';

  if (!exs.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--muted);">
      <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 12px;display:block;opacity:.4;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      <div style="font-weight:600;margin-bottom:4px;">No exhibitors found</div>
      <div style="font-size:12px;">Try adjusting your search or filters</div>
    </div>`;
    return;
  }

  exs.forEach(ex => {
    const stage = DB.EXHIBITOR_STAGES.find(s => s.id === ex.stage);
    const rep   = ex.assignedTo ? DB.getUser(ex.assignedTo) : null;
    const packText = ex.pack ? (ex.pack.charAt(0).toUpperCase() + ex.pack.slice(1)) : 'No pack';
    const price = ex.totalPrice ? '$' + ex.totalPrice.toLocaleString('en-US') : ex.packPrice ? '$' + ex.packPrice.toLocaleString('en-US') : '—';
    const repInitials = rep ? rep.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '?';

    const card = document.createElement('div');
    card.className = 'mobile-card';
    card.style.borderLeftColor = stage ? stage.color : 'var(--border)';
    card.onclick = () => openPanel(ex.id);
    card.innerHTML = `
      <div class="mobile-card-top">
        <div class="mobile-card-name">${escHtml(ex.institutionName)}</div>
        <span class="mobile-card-stage" style="background:${(stage ? stage.color : '#64748B') + '22'};color:${stage ? stage.color : '#64748B'}">${escHtml(stage ? stage.label : ex.stage)}</span>
      </div>
      <div class="mobile-card-org">${escHtml(ex.contactPerson)} · ${escHtml(ex.city || '')}</div>
      <div class="mobile-card-tags">
        <span class="chip pack-badge-card ${ex.pack || 'none'}" style="border-radius:99px;">${escHtml(packText)}</span>
        ${ex.specialty ? `<span class="chip">${escHtml(ex.specialty)}</span>` : ''}
      </div>
      <div class="mobile-card-footer">
        <div class="mobile-card-rep">
          <div class="avatar avatar-sm" style="background:${rep ? rep.color : '#64748B'}">${repInitials}</div>
          <span>${rep ? escHtml(rep.name) : 'Unassigned'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);">
          <span>${ex.attendees ? ex.attendees.length + ' att.' : '—'}</span>
          <strong style="color:var(--text);font-size:12px;">${price}</strong>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  });
}

// ── View switching ────────────────────────────────────────

function switchView(mode) {
  viewMode = mode;
  const btnBoard = document.getElementById('btnBoard');
  const btnCards = document.getElementById('btnCards');
  const btnList  = document.getElementById('btnList');
  if (btnBoard) btnBoard.classList.toggle('active', mode === 'kanban');
  if (btnCards) btnCards.classList.toggle('active', mode === 'cards');
  if (btnList)  btnList.classList.toggle('active', mode === 'list');

  var cw = document.getElementById('cardsWrap');
  cw.style.display = mode === 'cards'  ? 'flex' : 'none';
  if (mode !== 'cards') cw.classList.add('view-hidden'); else cw.classList.remove('view-hidden');
  document.getElementById('boardWrap').style.display = mode === 'kanban' ? ''    : 'none';
  document.getElementById('listWrap').style.display  = mode === 'list'   ? ''    : 'none';

  if (mode === 'list')   renderList();
  else if (mode === 'cards') renderCards();
  else renderBoard();
}

// ── Filters ───────────────────────────────────────────────

function handleSearch(val) {
  searchQ = val.trim();
  if (viewMode === 'cards') renderCards();
  else if (viewMode === 'kanban') renderBoard();
  else renderList();
}

function handlePackFilter(val) {
  filterPack = val;
  if (viewMode === 'cards') renderCards();
  else if (viewMode === 'kanban') renderBoard();
  else renderList();
}

// ── Side Panel ────────────────────────────────────────────

function openPanel(id) {
  openPanelId = id;
  const ex = DB.getExhibitor(id);
  if (!ex) return;

  const overlay = document.getElementById('panelOverlay');
  overlay.classList.add('open');
  document.getElementById('panelName').textContent = ex.institutionName;

  const stage = DB.EXHIBITOR_STAGES.find(s => s.id === ex.stage);
  const rep   = ex.assignedTo ? DB.getUser(ex.assignedTo) : null;
  const comReps = DB.getComRepList();
  const hasInvoice = !!ex.invoice;
  const exhUser = DB.getUsers().find(u => u.role === 'exhibitor' && u.exhibitorId === ex.id);

  const stageOptions = DB.EXHIBITOR_STAGES.map(s =>
    `<option value="${s.id}" ${s.id === ex.stage ? 'selected' : ''}>${escHtml(s.label)}</option>`
  ).join('');

  const repOptions = [
    `<option value="">Unassigned</option>`,
    ...comReps.map(r => `<option value="${r.id}" ${r.id === ex.assignedTo ? 'selected' : ''}>${escHtml(r.name)}</option>`)
  ].join('');

  const attendeeHtml = (ex.attendees && ex.attendees.length)
    ? ex.attendees.map((a, i) => `
      <div class="attendee-detail-card">
        <strong>${i+1}. ${escHtml(a.name)} ${escHtml(a.surname)}</strong>
        <span>${escHtml(a.position)}</span>
        <span>${escHtml(a.contactDetails)}</span>
        <span>Visa support: <strong>${a.visaSupport ? 'Yes' : 'No'}</strong></span>
        ${a.passportName ? `<span class="passport-link"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${escHtml(a.passportName)}</span>` : ''}
      </div>
    `).join('') : '<p style="font-size:12px;color:var(--muted);">No attendees added yet.</p>';

  const notesHtml = (ex.notes && ex.notes.length)
    ? ex.notes.map(n => `
      <div class="note-item">
        <div class="note-meta">${escHtml(n.authorName)} · ${new Date(n.createdAt).toLocaleDateString('en-GB')}</div>
        <div class="note-text">${escHtml(n.text)}</div>
      </div>
    `).join('') : '<p style="font-size:12px;color:var(--muted);">No notes yet.</p>';

  const historyHtml = (ex.history || []).slice(-10).reverse().map(h => {
    let label = '';
    if (h.type === 'created')       label = 'Record created';
    else if (h.type === 'assigned') label = `Assigned to ${escHtml(h.toName||'—')}`;
    else if (h.type === 'stage_change') label = `Moved to <strong>${escHtml(DB.EXHIBITOR_STAGES.find(s=>s.id===h.to)?.label||h.to)}</strong>`;
    else if (h.type === 'note_added')  label = `Note added by ${escHtml(h.byName)}`;
    else if (h.type === 'pack_selected') label = `Pack selected: ${escHtml(h.pack)}`;
    else if (h.type === 'docs_submitted') label = 'Documents submitted';
    else label = escHtml(h.type);
    return `<div style="font-size:11px;color:var(--muted);padding:4px 0;border-bottom:1px solid var(--border);">${label} <span style="float:right;">${new Date(h.at).toLocaleDateString('en-GB')}</span></div>`;
  }).join('');

  document.getElementById('panelBody').innerHTML = `
    <!-- Institution (editable) -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Institution</div>
      <div class="detail-field"><div class="detail-label">Name</div><input class="panel-input" id="ef_institutionName" value="${escHtml(ex.institutionName)}"></div>
      <div class="detail-field"><div class="detail-label">Type</div><input class="panel-input" id="ef_instType" value="${escHtml(ex.instType||'')}"></div>
      <div class="detail-field"><div class="detail-label">Specialty</div><input class="panel-input" id="ef_specialty" value="${escHtml(ex.specialty||'')}"></div>
      <div class="detail-field"><div class="detail-label">City</div><input class="panel-input" id="ef_city" value="${escHtml(ex.city||'')}"></div>
      <div class="detail-field"><div class="detail-label">Website</div><input class="panel-input" id="ef_website" value="${escHtml(ex.website||'')}"></div>
    </div>

    <!-- Contact (editable) -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Contact</div>
      <div class="detail-field"><div class="detail-label">Person</div><input class="panel-input" id="ef_contactPerson" value="${escHtml(ex.contactPerson)}"></div>
      <div class="detail-field"><div class="detail-label">Title</div><input class="panel-input" id="ef_jobTitle" value="${escHtml(ex.jobTitle||'')}"></div>
      <div class="detail-field"><div class="detail-label">Email</div><input class="panel-input" id="ef_email" type="email" value="${escHtml(ex.email)}"></div>
      <div class="detail-field"><div class="detail-label">Phone</div><input class="panel-input" id="ef_phone" value="${escHtml(ex.phone||'')}"></div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px;width:100%;" onclick="saveExhibitorInfo('${ex.id}')">Save Changes</button>
    </div>

    <!-- Login credentials (editable) -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Portal Login</div>
      ${exhUser ? `
      <div class="detail-field">
        <div class="detail-label">Login Email</div>
        <input class="panel-input" id="ef_loginEmail" type="email" value="${escHtml(exhUser.email)}">
      </div>
      <div class="detail-field" style="margin-top:6px;">
        <div class="detail-label">Password</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <input class="panel-input" id="ef_loginPassword" value="${escHtml(exhUser.password)}" style="font-family:monospace;flex:1;">
          <button onclick="navigator.clipboard.writeText(document.getElementById('ef_loginPassword').value).then(()=>showToast('Password copied','success'))" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;flex-shrink:0;" title="Copy password">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px;width:100%;" onclick="saveExhibitorLogin('${ex.id}','${exhUser.id}')">Update Login</button>
      ` : '<p style="font-size:12px;color:var(--muted);">No portal account found.</p>'}
    </div>

    <!-- Pack & pricing -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Pack &amp; Pricing</div>
      <div class="detail-field"><div class="detail-label">Pack</div><div class="detail-value">${ex.pack ? (ex.pack.charAt(0).toUpperCase()+ex.pack.slice(1)+' Pack') : '—'}</div></div>
      <div class="detail-field"><div class="detail-label">Pack Price</div><div class="detail-value">${ex.packPrice ? '$'+ex.packPrice.toLocaleString('en-US') : '—'}</div></div>
      <div class="detail-field"><div class="detail-label">Total (incl. attendees)</div><div class="detail-value" style="font-weight:700;color:var(--primary);">${ex.totalPrice ? '$'+ex.totalPrice.toLocaleString('en-US') : '—'}</div></div>
      ${hasInvoice ? `<div class="detail-field"><div class="detail-label">Invoice #</div><div class="detail-value">${escHtml(ex.invoice.number)}</div></div>` : ''}
    </div>

    <!-- Attendees -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Attendees (${(ex.attendees||[]).length})</div>
      ${attendeeHtml}
    </div>

    <!-- CRM controls -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Pipeline</div>
      <div class="detail-field">
        <div class="detail-label">Stage</div>
        <select class="stage-select" onchange="updateStage('${ex.id}', this.value)">
          ${stageOptions}
        </select>
      </div>
      ${isAdmin ? `
      <div class="detail-field" style="margin-top:8px;">
        <div class="detail-label">Assigned Rep</div>
        <select class="rep-select" onchange="updateRep('${ex.id}', this.value)">
          ${repOptions}
        </select>
      </div>` : ''}
      <div class="detail-field" style="margin-top:8px;">
        <div class="detail-label">Created</div>
        <div class="detail-value">${new Date(ex.createdAt).toLocaleDateString('en-GB')}</div>
      </div>
    </div>

    ${hasInvoice ? `
    <div class="side-panel-section">
      <div class="side-panel-section-title">Invoice</div>
      <button class="btn btn-ghost btn-sm" onclick="openInvoiceModal('${ex.id}')">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        View Invoice ${escHtml(ex.invoice.number)}
      </button>
    </div>` : ''}

    <!-- Notes -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">Notes</div>
      <div class="notes-list" id="panelNotes">${notesHtml}</div>
      <div class="note-input-wrap">
        <textarea class="note-input" id="noteInput" placeholder="Add a note…" rows="2"></textarea>
        <button class="btn btn-primary btn-sm" onclick="addNote('${ex.id}')">Add Note</button>
      </div>
    </div>

    <!-- History -->
    <div class="side-panel-section">
      <div class="side-panel-section-title">History</div>
      <div>${historyHtml}</div>
    </div>
  `;
}

function saveExhibitorInfo(id) {
  const ex = DB.getExhibitor(id);
  if (!ex) return;
  const updated = Object.assign({}, ex, {
    institutionName: document.getElementById('ef_institutionName').value.trim() || ex.institutionName,
    instType:        document.getElementById('ef_instType').value.trim(),
    specialty:       document.getElementById('ef_specialty').value.trim(),
    city:            document.getElementById('ef_city').value.trim(),
    website:         document.getElementById('ef_website').value.trim(),
    contactPerson:   document.getElementById('ef_contactPerson').value.trim() || ex.contactPerson,
    jobTitle:        document.getElementById('ef_jobTitle').value.trim(),
    email:           document.getElementById('ef_email').value.trim() || ex.email,
    phone:           document.getElementById('ef_phone').value.trim(),
    updatedAt:       new Date().toISOString(),
  });
  DB.saveExhibitor(updated);
  // keep portal user email in sync
  const users = DB.getUsers();
  const uIdx = users.findIndex(u => u.role === 'exhibitor' && u.exhibitorId === id);
  if (uIdx >= 0) {
    users[uIdx].email = updated.email;
    users[uIdx].name  = updated.contactPerson;
    localStorage.setItem('askhealth_users', JSON.stringify(users));
  }
  showToast('Exhibitor updated.', 'success');
  document.getElementById('panelName').textContent = updated.institutionName;
  renderBoard();
}

function saveExhibitorLogin(exhibitorId, userId) {
  const newEmail    = document.getElementById('ef_loginEmail').value.trim();
  const newPassword = document.getElementById('ef_loginPassword').value.trim();
  if (!newEmail || !newPassword) { showToast('Email and password cannot be empty.', 'error'); return; }
  const users = DB.getUsers();
  const uIdx = users.findIndex(u => u.id === userId);
  if (uIdx < 0) { showToast('User account not found.', 'error'); return; }
  users[uIdx].email    = newEmail.toLowerCase();
  users[uIdx].password = newPassword;
  localStorage.setItem('askhealth_users', JSON.stringify(users));
  // sync email on exhibitor record too
  const ex = DB.getExhibitor(exhibitorId);
  if (ex && ex.email === ex.email) {
    DB.saveExhibitor(Object.assign({}, ex, { email: newEmail.toLowerCase(), updatedAt: new Date().toISOString() }));
  }
  showToast('Login credentials updated.', 'success');
}

function closePanel() {
  document.getElementById('panelOverlay').classList.remove('open');
  openPanelId = null;
}

function updateStage(id, newStage) {
  DB.moveExhibitorStage(id, newStage, currentUser);
  showToast('Stage updated.', 'success');
  if (viewMode === 'kanban') renderBoard(); else renderList();
}

function updateRep(id, repId) {
  const ex = DB.getExhibitor(id);
  if (!ex) return;
  const rep = repId ? DB.getUser(repId) : null;
  ex.assignedTo = repId || null;
  ex.history = ex.history || [];
  ex.history.push({ type: 'assigned', byId: currentUser.id, byName: currentUser.name, to: repId, toName: rep ? rep.name : 'Unassigned', at: new Date().toISOString() });
  DB.saveExhibitor(ex);
  showToast('Representative updated.', 'success');
  if (viewMode === 'kanban') renderBoard(); else renderList();
}

function addNote(id) {
  const text = document.getElementById('noteInput').value.trim();
  if (!text) return;
  DB.addExhibitorNote(id, currentUser, text);
  document.getElementById('noteInput').value = '';
  showToast('Note added.', 'success');
  openPanel(id);
}

// ── Invoice Modal ─────────────────────────────────────────

function openInvoiceModal(id) {
  const ex = DB.getExhibitor(id);
  if (!ex || !ex.invoice) return;

  const overlay = document.getElementById('invoiceModal');
  overlay.classList.add('open');
  renderCRMInvoice(ex);
}

function closeInvoiceModal() {
  document.getElementById('invoiceModal').classList.remove('open');
}

function printInvoice() {
  window.print();
}

function renderCRMInvoice(ex) {
  const inv = ex.invoice;
  const fmt = v => '$' + v.toLocaleString('en-US');
  const dateStr = new Date(inv.issuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const packInclMap = {
    regular: 'Branded Exhibition Stand, Hotel Accommodation',
    gold:    'Branded Exhibition Stand, Hotel Accommodation, Networking Dinner, Flight Included',
    premium: 'Branded Exhibition Stand, Hotel Accommodation, Networking Dinner, Flight Included, Pre-Event Hospital Meetings',
  };
  const packIncludes = packInclMap[ex.pack] || '';
  const extra = inv.attendeeLine.extra || 0;
  const extraCount = inv.attendeeLine.count - 1;

  const attendeeRows = (ex.attendees || []).map((a, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${esc(a.name)} ${esc(a.surname)}</td>
      <td>${esc(a.position)}</td>
      <td>${esc(a.contactDetails)}</td>
      <td>${a.visaSupport ? '<span style="color:#38a169;font-weight:700;">Yes</span>' : 'No'}</td>
    </tr>
  `).join('');

  document.getElementById('invoiceModalBody').innerHTML = `
    <div id="invoiceDocCRM" style="font-family:Inter,sans-serif;padding:8px;">
      <div class="inv-header-crm" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;">
        <img src="../askhealth-logo.png" style="height:42px;" onerror="this.style.display='none'">
        <div class="inv-meta-crm" style="text-align:right;">
          <div class="inv-title" style="font-size:1.4rem;font-weight:800;color:#0F2D45;">INVOICE</div>
          <p style="font-size:.82rem;color:#64748B;margin-top:.2rem;"><strong>Invoice #:</strong> ${esc(inv.number)}</p>
          <p style="font-size:.82rem;color:#64748B;"><strong>Date:</strong> ${dateStr}</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:1.5rem;">
        <div>
          <div style="font-size:.72rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem;">Billed To</div>
          <p style="font-size:.88rem;line-height:1.7;"><strong style="color:#0F2D45;">${esc(ex.institutionName)}</strong><br>${esc(ex.contactPerson)}<br>${esc(ex.jobTitle)}<br>${esc(ex.city)}, Turkey<br>${esc(ex.email)}<br>${esc(ex.phone)}</p>
        </div>
        <div>
          <div style="font-size:.72rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem;">From</div>
          <p style="font-size:.88rem;line-height:1.7;"><strong style="color:#0F2D45;">ASKHEALTH / AskFairs</strong><br>morocco@askfairs.com<br>+212 630 57 65 85</p>
        </div>
      </div>

      <div style="background:rgba(42,171,219,.06);border:1px solid rgba(42,171,219,.2);border-radius:8px;padding:.9rem 1.1rem;margin-bottom:1.5rem;font-size:.86rem;">
        <strong style="color:#0F2D45;display:block;margin-bottom:.2rem;">Event</strong>
        ASKHEALTH Healthcare B2B Event — October 17, 2026 — La Palace d’Anfa, Casablanca
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem;">
        <thead>
          <tr style="background:#F8FAFC;">
            <th style="text-align:left;font-size:.72rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.4px;padding:.6rem .75rem;border-bottom:2px solid #E2E8F0;">Description</th>
            <th style="text-align:right;font-size:.72rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.4px;padding:.6rem .75rem;border-bottom:2px solid #E2E8F0;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:.8rem .75rem;border-bottom:1px solid #E2E8F0;font-size:.88rem;">
              <strong>${esc(inv.packLine.label)}</strong><br>
              <span style="font-size:.76rem;color:#64748B;">${esc(packIncludes)}</span>
            </td>
            <td style="padding:.8rem .75rem;border-bottom:1px solid #E2E8F0;font-size:.88rem;text-align:right;font-weight:600;">${fmt(inv.packLine.amount)}</td>
          </tr>
          ${extra > 0 ? `
          <tr>
            <td style="padding:.8rem .75rem;border-bottom:1px solid #E2E8F0;font-size:.88rem;">
              Additional Attendees (${extraCount} × $1,500)
            </td>
            <td style="padding:.8rem .75rem;border-bottom:1px solid #E2E8F0;font-size:.88rem;text-align:right;font-weight:600;">${fmt(extra)}</td>
          </tr>` : ''}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding-top:1rem;border-top:2px solid #0F2D45;text-align:right;font-size:1.1rem;font-weight:800;color:#0F2D45;">
              TOTAL: ${fmt(inv.total)}
            </td>
          </tr>
        </tfoot>
      </table>

      ${ex.attendees && ex.attendees.length ? `
      <div style="margin-bottom:1.5rem;">
        <div style="font-size:.72rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.6rem;border-bottom:1px solid #E2E8F0;padding-bottom:.4rem;">Attendees</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="font-size:.72rem;color:#64748B;font-weight:600;padding:.35rem .5rem;text-align:left;">#</th>
            <th style="font-size:.72rem;color:#64748B;font-weight:600;padding:.35rem .5rem;text-align:left;">Name</th>
            <th style="font-size:.72rem;color:#64748B;font-weight:600;padding:.35rem .5rem;text-align:left;">Position</th>
            <th style="font-size:.72rem;color:#64748B;font-weight:600;padding:.35rem .5rem;text-align:left;">Contact</th>
            <th style="font-size:.72rem;color:#64748B;font-weight:600;padding:.35rem .5rem;text-align:left;">Visa</th>
          </tr></thead>
          <tbody>${attendeeRows}</tbody>
        </table>
      </div>` : ''}

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:.9rem 1.1rem;font-size:.82rem;color:#64748B;line-height:1.6;">
        Payment instructions will be provided by the assigned commercial representative. Reference invoice <strong>${esc(inv.number)}</strong>.
      </div>
    </div>
  `;
}

// ── New Exhibitor Modal (admin only) ──────────────────────

function openNewExhibitorModal() {
  document.getElementById('newExModal').classList.add('open');
  document.getElementById('newExForm').reset();
  document.getElementById('newExError').classList.remove('visible');
  setTimeout(() => document.getElementById('nex_instName').focus(), 50);
}

function closeNewExModal() {
  document.getElementById('newExModal').classList.remove('open');
}

function saveNewExhibitor() {
  const errEl = document.getElementById('newExError');
  errEl.classList.remove('visible');

  const fields = {
    institutionName: document.getElementById('nex_instName').value.trim(),
    contactPerson:   document.getElementById('nex_contact').value.trim(),
    jobTitle:        document.getElementById('nex_jobTitle').value.trim(),
    email:           document.getElementById('nex_email').value.trim().toLowerCase(),
    phone:           document.getElementById('nex_phone').value.trim(),
    city:            document.getElementById('nex_city').value.trim(),
    specialty:       document.getElementById('nex_specialty').value,
    instType:        document.getElementById('nex_instType').value,
    website:         document.getElementById('nex_website').value.trim(),
    message:         document.getElementById('nex_message').value.trim(),
  };

  if (!fields.institutionName || !fields.contactPerson || !fields.email) {
    errEl.textContent = 'Institution name, contact person, and email are required.';
    errEl.classList.add('visible');
    return;
  }

  const ex = DB.createExhibitor(fields);
  showToast('Exhibitor added.', 'success');
  closeNewExModal();
  renderBoard();
  openPanel(ex.id);
}

// ── Utilities ─────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function esc(str) { return escHtml(str); }

// ── Event listeners ───────────────────────────────────────

document.getElementById('panelClose').addEventListener('click', closePanel);
document.getElementById('panelBackdrop').addEventListener('click', closePanel);
