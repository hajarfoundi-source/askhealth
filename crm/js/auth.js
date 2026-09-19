/* =========================================================
   ASKHEALTH CRM — auth.js
   Login, session management, and route guards.
   Depends on db.js being loaded first.
   ========================================================= */

const Auth = (() => {

  function login(email, password) {
    const user = DB.getUserByEmail(email);
    if (!user) {
      console.warn('[login] no user found for email:', email, '— available emails:', DB.getUsers().map(u => u.email));
      return { ok: false, error: 'Invalid email or password.' };
    }
    if ((user.password || '').trim() !== (password || '').trim()) {
      console.warn('[login] password mismatch for', user.email);
      return { ok: false, error: 'Invalid email or password.' };
    }
    if (user.role === 'exhibitor') return { ok: false, error: 'Exhibitor accounts must log in via the Exhibitor Portal.' };
    DB.setSession(user);
    return { ok: true, user };
  }

  function logout() {
    const session = DB.getSession();
    DB.clearSession();
    // Route back to appropriate login
    if (session && session.role === 'exhibitor') {
      window.location.href = '../exhibitor-login.html';
    } else {
      window.location.href = 'index.html';
    }
  }

  function logoutExhibitor() {
    DB.clearSession();
    window.location.href = 'exhibitor-login.html';
  }

  function getSession() {
    return DB.getSession();
  }

  function getCurrentUser() {
    const session = DB.getSession();
    if (!session) return null;
    return DB.getUser(session.userId);
  }

  // Redirect to login if no active session.
  function requireLogin() {
    if (!DB.getSession()) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  // Require an exhibitor session (for exhibitor-portal.html).
  function requireExhibitorLogin() {
    const session = DB.getSession();
    if (!session || session.role !== 'exhibitor') {
      window.location.href = 'exhibitor-login.html';
      return false;
    }
    return true;
  }

  // Redirect to correct dashboard if already logged in (used on login pages).
  function redirectIfLoggedIn() {
    const session = DB.getSession();
    if (!session) return;
    if (session.role === 'exhibitor') {
      window.location.href = 'exhibitor-portal.html';
    } else if (session.role === 'com_rep') {
      window.location.href = 'crm/exhibitors.html';
    } else {
      window.location.href = 'crm/kanban.html';
    }
  }

  // Redirect to correct page after CRM login.
  function redirectAfterLogin(role) {
    if (role === 'com_rep') {
      window.location.href = 'exhibitors.html';
    } else {
      window.location.href = 'kanban.html';
    }
  }

  function isAdmin() {
    const s = DB.getSession();
    return s && s.role === 'admin';
  }

  function isComRep() {
    const s = DB.getSession();
    return s && s.role === 'com_rep';
  }

  function isExhibitor() {
    const s = DB.getSession();
    return s && s.role === 'exhibitor';
  }

  return {
    login, logout, logoutExhibitor, getSession, getCurrentUser,
    requireLogin, requireExhibitorLogin, redirectIfLoggedIn, redirectAfterLogin,
    isAdmin, isComRep, isExhibitor,
  };

})();

// ── Toast helper (used across all pages) ─────────────────

function showToast(message, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ── Shared sidebar rendering ──────────────────────────────

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

function renderSidebar(activePage) {
  const session = DB.getSession();
  if (!session) return;

  const initials = session.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const isAdmin   = session.role === 'admin';
  const isComRep  = session.role === 'com_rep';

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Role label
  const roleLabel = isAdmin ? 'Admin' : isComRep ? 'Com. Rep' : 'Rep';
  const roleCls   = isAdmin ? 'admin' : isComRep ? 'com_rep' : 'rep';

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-logo">
        <img src="../askhealth-logo.png" alt="ASKHEALTH" onerror="this.style.display='none'">
        <div class="sidebar-logo-text">
          <strong>ASKHEALTH CRM</strong>
          <span>Healthcare B2B</span>
        </div>
      </div>
    </div>
    <nav class="sidebar-nav">
      ${(isAdmin || !isComRep) ? `
      <a href="kanban.html" class="${activePage === 'kanban' ? 'active' : ''}">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/>
        </svg>
        Lead Pipeline
      </a>
      <a href="analytics.html" class="${activePage === 'analytics' ? 'active' : ''}">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        Analytics
      </a>
      <a href="badges.html" class="${activePage === 'badges' ? 'active' : ''}">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M12 12v4M10 14h4"/>
        </svg>
        Badges
      </a>` : ''}
      ${(isAdmin || isComRep) ? `
      <div class="sidebar-divider"></div>
      <a href="exhibitors.html" class="${activePage === 'exhibitors' ? 'active' : ''}">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        Exhibitors
      </a>` : ''}
      ${isAdmin ? `
      <div class="sidebar-divider"></div>
      <a href="team.html" class="${activePage === 'team' ? 'active' : ''}">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        Team
      </a>
      <a href="scanner.html" class="${activePage === 'scanner' ? 'active' : ''}">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
          <rect x="7" y="7" width="10" height="10" rx="1"/>
        </svg>
        QR Scanner
      </a>` : ''}
    </nav>
    <div class="sidebar-footer">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div class="avatar" style="background:${session.color || '#1A6FA3'}">${initials}</div>
        <div style="min-width:0;">
          <div style="font-size:12px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${session.name}</div>
          <div class="role-badge ${roleCls}" style="margin-top:2px;display:inline-block;">${roleLabel}</div>
        </div>
      </div>
      <a href="#" onclick="Auth.logout();return false;" style="display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.5);font-size:12px;padding:6px 0;">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign out
      </a>
    </div>
  `;

  // ── Mobile sidebar toggle wiring ───────────────────────
  const brand = sidebar.querySelector('.sidebar-brand');
  if (brand) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sidebar-close';
    closeBtn.innerHTML = '✕';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.addEventListener('click', closeMobileSidebar);
    brand.appendChild(closeBtn);
  }

  // Overlay click closes sidebar
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.addEventListener('click', closeMobileSidebar);
  }

  // Hamburger opens sidebar
  const toggle = document.getElementById('sidebarToggle');
  if (toggle) {
    toggle.addEventListener('click', function() {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('open');
    });
  }

  // Auto-close sidebar when navigating (mobile)
  sidebar.querySelectorAll('.sidebar-nav a').forEach(function(link) {
    link.addEventListener('click', function() {
      if (window.innerWidth <= 768) closeMobileSidebar();
    });
  });
}
