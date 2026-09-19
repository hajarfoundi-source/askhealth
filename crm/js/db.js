/* =========================================================
   ASKHEALTH CRM — db.js
   localStorage cache + Supabase persistence.
   Every other script depends on this being loaded first.
   ========================================================= */

// ── Supabase config (public anon key — safe to ship) ──────
const _SB_URL      = 'https://xnfbtsqgiubqarkuualt.supabase.co';
const _SB_ANON_KEY = 'sb_publishable_GzesxJPJLV8Pxgd_y33p0A_1NlM0uC1';

const DB = (() => {

  // ── Keys ─────────────────────────────────────────────────
  const KEYS = {
    leads:      'askhealth_leads',
    users:      'askhealth_users',
    session:    'askhealth_session',
    badgeSeq:   'askhealth_badge_seq',
    exhibitors: 'askhealth_exhibitors',
    invoiceSeq: 'askhealth_invoice_seq',
  };

  // ── Stages (leads) ────────────────────────────────────────
  const STAGES = [
    { id: 'new',           label: 'New',                  color: '#64748B' },
    { id: 'contacted',     label: 'Contacted',            color: '#2AABDB' },
    { id: 'confirmed',     label: 'Confirmed Attendance', color: '#38a169' },
    { id: 'cancelled',     label: 'Cancelled Attendance', color: '#e53e3e' },
    { id: 'badge_sent',    label: 'Badge Sent',           color: '#D4A843' },
    { id: 'b2b_pre_event', label: 'B2B Pre-Event',        color: '#805AD5' },
    { id: 'junk',          label: 'Junk Lead',            color: '#A0AEC0' },
  ];

  // ── Stages (exhibitors) ───────────────────────────────────
  const EXHIBITOR_STAGES = [
    { id: 'application',    label: 'Application Received', color: '#64748B' },
    { id: 'pack_selected',  label: 'Pack Selected',        color: '#2AABDB' },
    { id: 'docs_submitted', label: 'Documents Submitted',  color: '#1A6FA3' },
    { id: 'payment_pending',label: 'Payment Pending',      color: '#D4A843' },
    { id: 'confirmed',      label: 'Confirmed',            color: '#38a169' },
    { id: 'cancelled',      label: 'Cancelled',            color: '#e53e3e' },
  ];

  // ── Default users ─────────────────────────────────────────
  const DEFAULT_USERS = [
    { id: 'admin_1', name: 'ASKHEALTH Admin',  email: 'admin@askhealth.com',  password: 'askhealth2026', role: 'admin',   color: '#1A6FA3' },
    { id: 'rep_1',   name: 'Sara Idrissi',   email: 'sara@askhealth.com',   password: 'rep2026',     role: 'rep',     color: '#e53e3e' },
    { id: 'rep_2',   name: 'Karim Ouali',    email: 'karim@askhealth.com',  password: 'rep2026',     role: 'rep',     color: '#805AD5' },
    { id: 'rep_3',   name: 'Fatima Zahra',   email: 'fatima@askhealth.com', password: 'rep2026',     role: 'rep',     color: '#38a169' },
    { id: 'com_1',   name: 'Alex Martins',   email: 'alex@askhealth.com',   password: 'com2026',     role: 'com_rep', color: '#D4A843' },
    { id: 'com_2',   name: 'Nadia Bensalem', email: 'nadia@askhealth.com',  password: 'com2026',     role: 'com_rep', color: '#ED8936' },
    { id: 'com_3',   name: 'Omar Tahiri',    email: 'omar@askhealth.com',   password: 'com2026',     role: 'com_rep', color: '#667EEA' },
  ];

  const REP_COLORS = ['#e53e3e','#805AD5','#38a169','#D4A843','#2AABDB','#1A6FA3','#ED8936','#E53E3E','#667EEA'];

  // ── Supabase helpers ──────────────────────────────────────

  let _client = null;
  function _sb() {
    if (_client) return _client;
    try {
      if (typeof supabase === 'undefined' || _SB_URL.startsWith('YOUR_')) return null;
      _client = supabase.createClient(_SB_URL, _SB_ANON_KEY, { auth: { persistSession: false } });
    } catch(e) { _client = null; }
    return _client;
  }

  // Strip base64 passport data before sending to the server (payload size)
  function _cleanForServer(obj) {
    const json = JSON.stringify(obj, (key, val) => key === 'passportData' ? undefined : val);
    return JSON.parse(json);
  }

  function _sbSave(table, id, data) {
    const sb = _sb();
    if (!sb) return;
    sb.from(table)
      .upsert({ id: String(id), data: _cleanForServer(data), updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.warn('[Supabase write error]', table, id, error); });
  }

  function _sbDelete(table, id) {
    const sb = _sb();
    if (!sb) return;
    sb.from(table).delete().eq('id', String(id))
      .then(({ error }) => { if (error) console.warn('[Supabase delete error]', table, id, error); });
  }

  function _sbSaveConfig(key, value) {
    const sb = _sb();
    if (!sb) return;
    sb.from('config').upsert({ id: key, value: String(value), updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.warn('[Supabase config write error]', key, error); });
  }

  // Reads every row of a table (PostgREST caps one response at 1000 rows)
  async function _sbFetchAll(table, columns) {
    const sb = _sb();
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from(table).select(columns).range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  // ── Bootstrap (populates localStorage defaults) ───────────
  function _bootstrap() {
    if (!localStorage.getItem(KEYS.users)) {
      localStorage.setItem(KEYS.users, JSON.stringify(DEFAULT_USERS));
    } else {
      const users = _read(KEYS.users) || [];
      const EMAIL_MAP = { admin_1: 'admin@askhealth.com', rep_1: 'sara@askhealth.com', rep_2: 'karim@askhealth.com', rep_3: 'fatima@askhealth.com' };
      let changed = false;
      users.forEach(u => {
        if (!u.email) {
          u.email = EMAIL_MAP[u.id] || ((u.username || u.name.split(' ')[0].toLowerCase()) + '@askhealth.com');
          changed = true;
        }
      });
      const ids = users.map(u => u.id);
      DEFAULT_USERS.filter(u => u.role === 'com_rep').forEach(cu => {
        if (!ids.includes(cu.id)) { users.push(cu); changed = true; }
      });
      if (changed) _write(KEYS.users, users);
    }
    if (!localStorage.getItem(KEYS.leads))      localStorage.setItem(KEYS.leads,      JSON.stringify([]));
    if (!localStorage.getItem(KEYS.exhibitors)) localStorage.setItem(KEYS.exhibitors, JSON.stringify([]));
    if (!localStorage.getItem(KEYS.badgeSeq))   localStorage.setItem(KEYS.badgeSeq,   '0');
    if (!localStorage.getItem(KEYS.invoiceSeq)) localStorage.setItem(KEYS.invoiceSeq, '0');
  }

  // ── Sync: Supabase → localStorage → re-render ─────────────

  async function _pullUsers() {
    const rows = await _sbFetchAll('users', 'data');
    if (!rows.length) {
      // Fresh project — push local bootstrap data up to Supabase
      await _pushAllToServer();
    } else {
      _write(KEYS.users, rows.map(r => r.data));
      _bootstrap();
    }
  }

  async function _pullTable(table, key) {
    const rows = await _sbFetchAll(table, 'data');
    const list = rows.map(r => r.data);
    // Newest first, as the CRM lists expect
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    _write(key, list);
    window.dispatchEvent(new CustomEvent('db-synced'));
  }

  async function _pullConfig() {
    const rows = await _sbFetchAll('config', 'id,value');
    rows.forEach(r => {
      if (r.id === 'badge_seq')   localStorage.setItem(KEYS.badgeSeq,   r.value || '0');
      if (r.id === 'invoice_seq') localStorage.setItem(KEYS.invoiceSeq, r.value || '0');
    });
  }

  // Initial load, then live updates whenever any device makes a change
  function _bgSync() {
    const sb = _sb();
    if (!sb) return;
    const log = label => e => console.warn('[Supabase sync]', label, e);
    const users      = () => _pullUsers().catch(log('users'));
    const leads      = () => _pullTable('leads', KEYS.leads).catch(log('leads'));
    const exhibitors = () => _pullTable('exhibitors', KEYS.exhibitors).catch(log('exhibitors'));
    const config     = () => _pullConfig().catch(log('config'));

    users(); leads(); exhibitors(); config();

    sb.channel('askhealth-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' },      users)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' },      leads)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exhibitors' }, exhibitors)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config' },     config)
      .subscribe();
  }

  function init() {
    // Render immediately from localStorage — never block the page
    _bootstrap();
    // Attempt Supabase sync in the background (does not delay rendering)
    try { _bgSync(); } catch(e) { console.warn('[Supabase sync failed]', e); }
    return Promise.resolve();
  }

  async function _pushAllToServer() {
    const sb = _sb();
    if (!sb) return;
    const now  = new Date().toISOString();
    const rows = list => list.map(x => ({ id: String(x.id), data: _cleanForServer(x), updated_at: now }));
    try {
      await sb.from('users').upsert(rows(getUsers()));
      if (getLeads().length)      await sb.from('leads').upsert(rows(getLeads()));
      if (getExhibitors().length) await sb.from('exhibitors').upsert(rows(getExhibitors()));
      await sb.from('config').upsert([
        { id: 'badge_seq',   value: localStorage.getItem(KEYS.badgeSeq)   || '0', updated_at: now },
        { id: 'invoice_seq', value: localStorage.getItem(KEYS.invoiceSeq) || '0', updated_at: now },
      ]);
    } catch(e) { console.warn('[Supabase first-push failed]', e); }
  }

  // ── Helpers ───────────────────────────────────────────────
  function _read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  }
  function _write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ── Leads ─────────────────────────────────────────────────

  function getLeads() { return _read(KEYS.leads) || []; }
  function getLead(id) { return getLeads().find(l => l.id === id) || null; }
  function getLeadsForUser(userId) { return getLeads().filter(l => l.assignedTo === userId); }

  function saveLead(lead) {
    lead.updatedAt = new Date().toISOString();
    const leads = getLeads();
    const idx = leads.findIndex(l => l.id === lead.id);
    if (idx >= 0) leads[idx] = lead; else leads.unshift(lead);
    _write(KEYS.leads, leads);
    _sbSave('leads', lead.id, lead);
  }

  function deleteLead(id) {
    _write(KEYS.leads, getLeads().filter(l => l.id !== id));
    _sbDelete('leads', id);
  }

  function moveLeadStage(id, newStage, byUser) {
    const lead = getLead(id);
    if (!lead) return;
    const oldStage = lead.stage;
    lead.stage = newStage;
    lead.history = lead.history || [];
    lead.history.push({ type: 'stage_change', from: oldStage, to: newStage,
      byId: byUser ? byUser.id : null, byName: byUser ? byUser.name : 'System',
      at: new Date().toISOString() });
    if (newStage === 'confirmed' && !lead.badgeNumber) _assignBadgeNumber(lead);
    saveLead(lead);
  }

  function addNote(leadId, authorUser, text) {
    const lead = getLead(leadId);
    if (!lead) return;
    lead.notes = lead.notes || [];
    lead.notes.push({ id: 'note_' + Date.now(), authorId: authorUser.id,
      authorName: authorUser.name, text: text.trim(), createdAt: new Date().toISOString() });
    lead.history = lead.history || [];
    lead.history.push({ type: 'note_added', byId: authorUser.id,
      byName: authorUser.name, at: new Date().toISOString() });
    saveLead(lead);
  }

  function createLead(fields, byUser) {
    const reps = getRepList();
    const rep  = reps.length ? reps[Math.floor(Math.random() * reps.length)] : null;
    const lead = {
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      fullName: fields.fullName || '', email: fields.email || '',
      org: fields.org || '', country: fields.country || '',
      interest: fields.interest || '', phone: fields.phone || '',
      message: fields.message || '', stage: 'new',
      assignedTo: rep ? rep.id : null, badgeNumber: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      notes: [], history: [
        { type: 'created', byId: byUser ? byUser.id : 'system',
          byName: byUser ? byUser.name : 'System', at: new Date().toISOString() },
      ],
    };
    if (rep) lead.history.push({ type: 'assigned', byId: 'system', byName: 'System',
      to: rep.id, toName: rep.name, at: new Date().toISOString() });
    saveLead(lead);
    return lead;
  }

  // ── Badge numbers ─────────────────────────────────────────

  function _assignBadgeNumber(lead) {
    let seq = parseInt(localStorage.getItem(KEYS.badgeSeq) || '0') + 1;
    localStorage.setItem(KEYS.badgeSeq, String(seq));
    _sbSaveConfig('badge_seq', seq);
    lead.badgeNumber = String(seq).padStart(4, '0');
    return lead.badgeNumber;
  }

  function generateBadgeNumber(lead) {
    if (lead.badgeNumber) return lead.badgeNumber;
    _assignBadgeNumber(lead);
    saveLead(lead);
    return lead.badgeNumber;
  }

  // ── Invoice numbers ───────────────────────────────────────

  function generateInvoiceNumber() {
    let seq = parseInt(localStorage.getItem(KEYS.invoiceSeq) || '0') + 1;
    localStorage.setItem(KEYS.invoiceSeq, String(seq));
    _sbSaveConfig('invoice_seq', seq);
    return 'EXH-' + String(seq).padStart(4, '0');
  }

  // ── Check-in ─────────────────────────────────────────────

  function checkInLead(id, byUser) {
    const lead = getLead(id);
    if (!lead) return { ok: false, error: 'Lead not found.' };
    if (lead.checkedIn) return { ok: false, alreadyIn: true, lead };
    lead.checkedIn = true;
    lead.checkedInAt = new Date().toISOString();
    lead.history = lead.history || [];
    lead.history.push({ type: 'checked_in',
      byId: byUser ? byUser.id : 'scanner', byName: byUser ? byUser.name : 'Scanner',
      at: lead.checkedInAt });
    saveLead(lead);
    return { ok: true, lead };
  }

  function getLeadByBadgeNumber(badgeNumber) {
    return getLeads().find(l => l.badgeNumber === badgeNumber) || null;
  }

  // ── Users ─────────────────────────────────────────────────

  function getUsers() { return _read(KEYS.users) || []; }
  function getUser(id) { return getUsers().find(u => u.id === id) || null; }
  function getUserByEmail(email) {
    const needle = (email || '').toLowerCase().trim();
    return getUsers().find(u => (u.email || '').toLowerCase().trim() === needle) || null;
  }
  function getRepList()    { return getUsers().filter(u => u.role === 'rep'); }
  function getComRepList() { return getUsers().filter(u => u.role === 'com_rep'); }

  function createUser(fields) {
    const users = getUsers();
    if (users.find(u => u.email === fields.email.toLowerCase().trim()))
      return { ok: false, error: 'Email already in use.' };
    const usedColors = users.map(u => u.color);
    const color = fields.color || REP_COLORS.find(c => !usedColors.includes(c)) || REP_COLORS[users.length % REP_COLORS.length];
    const user = {
      id: (fields.role || 'rep') + '_' + Date.now(),
      name: fields.name.trim(), email: fields.email.toLowerCase().trim(),
      password: fields.password, role: fields.role || 'rep', color,
      ...(fields.exhibitorId ? { exhibitorId: fields.exhibitorId } : {}),
    };
    users.push(user);
    _write(KEYS.users, users);
    _sbSave('users', user.id, user);
    return { ok: true, user };
  }

  function updateUser(id, fields) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx < 0) return { ok: false, error: 'User not found.' };
    if (fields.email) {
      const emailLower = fields.email.toLowerCase().trim();
      if (users.find((u, i) => i !== idx && u.email === emailLower))
        return { ok: false, error: 'Email already in use.' };
      users[idx].email = emailLower;
    }
    if (fields.name)     users[idx].name     = fields.name.trim();
    if (fields.password) users[idx].password = fields.password;
    _write(KEYS.users, users);
    _sbSave('users', users[idx].id, users[idx]);
    return { ok: true, user: users[idx] };
  }

  function deleteUser(id) {
    const users = getUsers();
    const user  = users.find(u => u.id === id);
    if (!user || user.role === 'admin') return { ok: false, error: 'Cannot delete admin.' };
    _write(KEYS.users, users.filter(u => u.id !== id));
    _sbDelete('users', id);
    return { ok: true };
  }

  function assignLeadToRandomRep(lead) {
    const reps = getRepList();
    if (!reps.length) return null;
    const rep = reps[Math.floor(Math.random() * reps.length)];
    lead.assignedTo = rep.id;
    lead.history = lead.history || [];
    lead.history.push({ type: 'assigned', byId: 'system', byName: 'System',
      to: rep.id, toName: rep.name, at: new Date().toISOString() });
    return rep;
  }

  // ── Exhibitors ────────────────────────────────────────────

  function getExhibitors() { return _read(KEYS.exhibitors) || []; }
  function getExhibitor(id) { return getExhibitors().find(e => e.id === id) || null; }
  function getExhibitorByEmail(email) {
    return getExhibitors().find(e => e.email === email.toLowerCase().trim()) || null;
  }
  function getExhibitorsForComRep(userId) {
    return getExhibitors().filter(e => e.assignedTo === userId);
  }

  function saveExhibitor(exhibitor) {
    exhibitor.updatedAt = new Date().toISOString();
    const exhibitors = getExhibitors();
    const idx = exhibitors.findIndex(e => e.id === exhibitor.id);
    if (idx >= 0) exhibitors[idx] = exhibitor; else exhibitors.unshift(exhibitor);
    _write(KEYS.exhibitors, exhibitors);
    _sbSave('exhibitors', exhibitor.id, exhibitor);
  }

  function moveExhibitorStage(id, newStage, byUser) {
    const ex = getExhibitor(id);
    if (!ex) return;
    const oldStage = ex.stage;
    ex.stage = newStage;
    ex.history = ex.history || [];
    ex.history.push({ type: 'stage_change', from: oldStage, to: newStage,
      byId: byUser ? byUser.id : null, byName: byUser ? byUser.name : 'System',
      at: new Date().toISOString() });
    saveExhibitor(ex);
  }

  function addExhibitorNote(exhibitorId, authorUser, text) {
    const ex = getExhibitor(exhibitorId);
    if (!ex) return;
    ex.notes = ex.notes || [];
    ex.notes.push({ id: 'note_' + Date.now(), authorId: authorUser.id,
      authorName: authorUser.name, text: text.trim(), createdAt: new Date().toISOString() });
    ex.history = ex.history || [];
    ex.history.push({ type: 'note_added', byId: authorUser.id,
      byName: authorUser.name, at: new Date().toISOString() });
    saveExhibitor(ex);
  }

  function createExhibitor(fields) {
    const comReps = getComRepList();
    const rep = comReps.length ? comReps[Math.floor(Math.random() * comReps.length)] : null;
    const ex = {
      id: 'exhibitor_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      institutionName: fields.institutionName || '', contactPerson: fields.contactPerson || '',
      jobTitle: fields.jobTitle || '', email: fields.email || '', phone: fields.phone || '',
      city: fields.city || '', specialty: fields.specialty || '',
      instType: fields.instType || '', website: fields.website || '',
      message: fields.message || '', pack: null, packPrice: null,
      attendees: [], totalPrice: null, invoice: null, stage: 'application',
      assignedTo: rep ? rep.id : null, notes: [],
      history: [{ type: 'created', byId: 'system', byName: 'System', at: new Date().toISOString() }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    if (rep) ex.history.push({ type: 'assigned', byId: 'system', byName: 'System',
      to: rep.id, toName: rep.name, at: new Date().toISOString() });
    saveExhibitor(ex);
    return ex;
  }

  // ── Session (localStorage only — device-specific) ─────────

  function getSession()  { return _read(KEYS.session); }
  function setSession(user) {
    _write(KEYS.session, { userId: user.id, role: user.role,
      name: user.name, color: user.color, loginAt: new Date().toISOString() });
  }
  function clearSession() { localStorage.removeItem(KEYS.session); }

  // ── Public API ────────────────────────────────────────────
  return {
    STAGES, EXHIBITOR_STAGES,
    init, _bootstrap,
    // Leads
    getLeads, getLead, getLeadsForUser, saveLead, deleteLead,
    moveLeadStage, addNote, createLead,
    // Badge / Check-in
    generateBadgeNumber, checkInLead, getLeadByBadgeNumber,
    // Invoice
    generateInvoiceNumber,
    // Users
    getUsers, getUser, getUserByEmail, getRepList, getComRepList,
    createUser, updateUser, deleteUser, assignLeadToRandomRep,
    // Exhibitors
    getExhibitors, getExhibitor, getExhibitorByEmail, getExhibitorsForComRep,
    saveExhibitor, moveExhibitorStage, addExhibitorNote, createExhibitor,
    // Session
    getSession, setSession, clearSession,
  };

})();
