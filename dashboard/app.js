// Agent Board - Dashboard App
(function () {
  const API = "/api";

  // --- PIN Protection ---
  const PIN_SESSION_KEY = "ab-pin-unlocked";
  function checkPin() {
    if (sessionStorage.getItem(PIN_SESSION_KEY) === "1") return;
    fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "" })
    }).then(r => r.json()).then(data => {
      if (data.ok) {
        sessionStorage.setItem(PIN_SESSION_KEY, "1");
      } else {
        const overlay = document.getElementById("pinOverlay");
        if (overlay) overlay.classList.remove("hidden");
        document.body.classList.add("pin-active");
      }
    }).catch(() => {
      const overlay = document.getElementById("pinOverlay");
      if (overlay) overlay.classList.remove("hidden");
      document.body.classList.add("pin-active");
    });
  }
  function setupPinForm() {
    let pinValue = "";
    const MAX_DIGITS = 4;
    const overlay = document.getElementById("pinOverlay");
    const dots = document.querySelectorAll(".pin-dot");
    const okBtn = document.getElementById("pinSubmit");
    const errEl = document.getElementById("pinError");

    function updateDots() {
      dots.forEach((d, i) => {
        d.classList.toggle("filled", i < pinValue.length);
        d.classList.remove("error");
      });
      if (okBtn) okBtn.classList.toggle("active", pinValue.length === MAX_DIGITS);
    }
    function addDigit(d) {
      if (pinValue.length >= MAX_DIGITS) return;
      pinValue += d;
      updateDots();
      if (pinValue.length === MAX_DIGITS) tryUnlock();
    }
    function backspace() {
      if (!pinValue.length) return;
      pinValue = pinValue.slice(0, -1);
      updateDots();
    }
    function tryUnlock() {
      if (!pinValue) return;
      fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinValue })
      }).then(r => r.json()).then(data => {
        if (data.ok) {
          sessionStorage.setItem(PIN_SESSION_KEY, "1");
          if (overlay) overlay.classList.add("hidden");
          document.body.classList.remove("pin-active");
          if (errEl) errEl.classList.add("hidden");
        } else {
          const dotsRow = document.getElementById("pinDots");
          dots.forEach(d => d.classList.add("error"));
          if (dotsRow) {
            dotsRow.classList.remove("shake");
            void dotsRow.offsetWidth;
            dotsRow.classList.add("shake");
          }
          if (errEl) errEl.classList.remove("hidden");
          pinValue = "";
          setTimeout(() => {
            updateDots();
            dotsRow && dotsRow.classList.remove("shake");
          }, 500);
        }
      }).catch(() => { pinValue = ""; updateDots(); });
    }

    document.querySelectorAll(".pin-key[data-digit]").forEach(btn => {
      btn.addEventListener("click", () => {
        btn.classList.add("pressed");
        setTimeout(() => btn.classList.remove("pressed"), 100);
        addDigit(btn.dataset.digit);
      });
    });
    const bkBtn = document.getElementById("pinBackspace");
    if (bkBtn) bkBtn.addEventListener("click", () => {
      bkBtn.classList.add("pressed");
      setTimeout(() => bkBtn.classList.remove("pressed"), 100);
      backspace();
    });
    if (okBtn) okBtn.addEventListener("click", () => {
      if (pinValue.length === MAX_DIGITS) tryUnlock();
    });
    document.addEventListener("keydown", (e) => {
      if (!overlay || overlay.classList.contains("hidden")) return;
      if (/^[0-9]$/.test(e.key)) addDigit(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Enter") tryUnlock();
    });
    if (overlay) overlay.addEventListener("click", e => e.stopPropagation());
    updateDots();
  }
  document.addEventListener("DOMContentLoaded", () => { setupPinForm(); checkPin(); });
  // --- End PIN Protection ---

  const COLUMNS = ["backlog", "todo", "doing", "review", "done", "failed"];
  const COL_LABELS = { backlog: "Backlog", todo: "To Do", doing: "Doing", review: "Review", done: "Done", failed: "Failed" };

  // Load saved project from localStorage
  function getSavedProject() {
    try {
      return localStorage.getItem("ab-currentProject");
    } catch { return null; }
  }

  function saveCurrentProject(projectId) {
    try {
      if (projectId) {
        localStorage.setItem("ab-currentProject", projectId);
      } else {
        localStorage.removeItem("ab-currentProject");
      }
    } catch { /* ignore */ }
  }

  let state = {
    projects: [],
    tasks: [],
    agents: [],
    currentProject: getSavedProject(),
    currentView: "board",
    filterAgent: null,
    showArchived: false,
  };

  // --- Theme ---
  const themeToggle = document.getElementById("themeToggle");
  const themeToggleDesktop = document.getElementById("themeToggleDesktop");
  const allThemeToggles = [themeToggle, themeToggleDesktop].filter(Boolean);

  function syncThemeToggles(isDark) {
    allThemeToggles.forEach(btn => {
      btn.textContent = isDark ? "\u2600" : "\u263E";
      btn.setAttribute("data-tooltip", "Switch theme");
    });
  }

  function initTheme() {
    const saved = localStorage.getItem("ab-theme");
    const prefersDark = !saved && matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved === "dark" || prefersDark;
    if (isDark) document.documentElement.setAttribute("data-theme", "dark");
    syncThemeToggles(isDark);
  }

  allThemeToggles.forEach(btn => {
    btn.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
      syncThemeToggles(!isDark);
      localStorage.setItem("ab-theme", isDark ? "light" : "dark");
    });
  });
  initTheme();

  // --- API helpers ---
  async function api(path, opts) {
    const res = await fetch(API + path, {
      headers: { "Content-Type": "application/json", "X-API-Key": "sk-dashboard-001" },
      ...opts,
    });
    return res.json();
  }

  // --- Data loading ---
  async function loadProjects() {
    state.projects = await api("/projects");
    renderProjectSelect();
    
    // Use saved project if it exists and is still valid
    const savedProject = getSavedProject();
    const projectExists = state.projects.some(p => p.id === savedProject);
    
    if (state.projects.length && (!state.currentProject || !projectExists)) {
      state.currentProject = state.projects[0].id;
      saveCurrentProject(state.currentProject);
    } else if (projectExists) {
      state.currentProject = savedProject;
    }
  }

  async function loadTasks() {
    if (!state.currentProject) { state.tasks = []; return; }
    state.tasks = await api("/tasks?projectId=" + state.currentProject);
  }

  async function loadAgents() {
    state.agents = await api("/agents");
  }

  async function refresh() {
    await Promise.all([loadProjects(), loadAgents()]);
    await loadTasks();
    render();
  }

  // --- Project selector ---
  const projectSelect = document.getElementById("projectSelect");
  const projectSelectDesktop = document.getElementById("projectSelectDesktop");

  function renderProjectSelect() {
    const options = state.projects.length
      ? state.projects.map((p) => `<option value="${p.id}" ${p.id === state.currentProject ? "selected" : ""}>${p.name}</option>`).join("")
      : '<option value="">No projects</option>';
    if (projectSelect) projectSelect.innerHTML = options;
    if (projectSelectDesktop) projectSelectDesktop.innerHTML = options;
  }

  function onProjectChange(value) {
    state.currentProject = value;
    saveCurrentProject(state.currentProject);
    // Keep both selectors in sync
    if (projectSelect) projectSelect.value = value;
    if (projectSelectDesktop) projectSelectDesktop.value = value;
    loadTasks().then(() => render());
  }

  if (projectSelect) projectSelect.addEventListener("change", () => onProjectChange(projectSelect.value));
  if (projectSelectDesktop) projectSelectDesktop.addEventListener("change", () => onProjectChange(projectSelectDesktop.value));

  // --- Agent filter ---
  const agentFilter = document.getElementById("agentFilter");
  function renderAgentFilter() {
    // Get unique agents from tasks
    const agents = [...new Set(state.tasks.map(t => t.assignee).filter(Boolean))].sort();
    agentFilter.innerHTML = '<option value="">All Agents</option>' +
      agents.map(a => `<option value="${a}" ${a === state.filterAgent ? "selected" : ""}>${a}</option>`).join("");
  }

  agentFilter.addEventListener("change", () => {
    state.filterAgent = agentFilter.value || null;
    render();
  });

  // --- Archive toggle ---
  document.getElementById("archiveToggle").addEventListener("change", (e) => {
    state.showArchived = e.target.checked;
    render();
  });

  // --- View tabs ---
  document.getElementById("viewTabs").addEventListener("click", (e) => {
    if (!e.target.classList.contains("tab")) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    e.target.classList.add("active");
    state.currentView = e.target.dataset.view;
    // Sync bottom nav
    document.querySelectorAll(".bottom-nav-item").forEach(b => {
      b.classList.toggle("active", b.dataset.view === state.currentView);
    });
    render();
  });

  // --- Bottom Navigation (mobile) ---
  const bottomNav = document.getElementById("bottomNav");
  if (bottomNav) {
    bottomNav.querySelectorAll(".bottom-nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        state.currentView = view;
        // Sync top tabs
        document.querySelectorAll(".tab").forEach(t => {
          t.classList.toggle("active", t.dataset.view === view);
        });
        // Sync bottom nav
        bottomNav.querySelectorAll(".bottom-nav-item").forEach(b => {
          b.classList.toggle("active", b.dataset.view === view);
        });
        render();
      });
    });
  }

  // --- FAB (Floating Action Button) ---
  const fabContainer = document.getElementById("fabContainer");
  const fabMain = document.getElementById("fabMain");
  const fabMenu = document.getElementById("fabMenu");
  const fabNewProject = document.getElementById("fabNewProject");
  const fabNewTask = document.getElementById("fabNewTask");
  let fabOpen = false;

  function toggleFab() {
    fabOpen = !fabOpen;
    fabMenu.classList.toggle("open", fabOpen);
    fabMain.textContent = fabOpen ? "\u2715" : "+";
    fabMain.style.transform = fabOpen ? "rotate(45deg)" : "rotate(0deg)";
  }

  fabMain.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFab();
  });

  fabNewProject.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFab();
    document.getElementById("newProjectBtn").click();
  });

  fabNewTask.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFab();
    showTaskModal("backlog");
  });

  // Close FAB when clicking outside
  document.addEventListener("click", (e) => {
    if (fabOpen && !fabContainer.contains(e.target)) {
      toggleFab();
    }
  });

  // --- Pull to refresh ---
  let ptrStartY = 0;
  let ptrPulling = false;
  let ptrThreshold = 80;
  const ptrIndicator = document.getElementById("ptrIndicator");
  const boardView = document.getElementById("boardView");

  function initPullToRefresh() {
    // Only on mobile
    if (window.matchMedia('(min-width: 769px)').matches) return;

    boardView.addEventListener('touchstart', (e) => {
      if (boardView.scrollTop === 0) {
        ptrStartY = e.touches[0].clientY;
        ptrPulling = true;
      }
    }, { passive: true });

    boardView.addEventListener('touchmove', (e) => {
      if (!ptrPulling) return;
      
      const y = e.touches[0].clientY;
      const diff = y - ptrStartY;
      
      if (diff > 0 && boardView.scrollTop <= 0) {
        e.preventDefault();
        const pullDistance = Math.min(diff * 0.5, ptrThreshold + 20);
        ptrIndicator.style.transform = `translateY(${pullDistance}px)`;
        
        if (pullDistance >= ptrThreshold) {
          ptrIndicator.querySelector('span').textContent = 'Release to refresh';
          ptrIndicator.classList.add('pulling');
        } else {
          ptrIndicator.querySelector('span').textContent = 'Pull to refresh';
          ptrIndicator.classList.remove('pulling');
        }
      }
    }, { passive: false });

    boardView.addEventListener('touchend', async () => {
      if (!ptrPulling) return;
      ptrPulling = false;
      
      const currentTransform = ptrIndicator.style.transform;
      const currentPull = parseInt(currentTransform.replace('translateY(', '').replace('px)', '')) || 0;
      
      if (currentPull >= ptrThreshold) {
        ptrIndicator.classList.add('refreshing');
        ptrIndicator.querySelector('span').textContent = 'Refreshing...';
        await refresh();
      }
      
      ptrIndicator.style.transform = '';
      ptrIndicator.classList.remove('pulling', 'refreshing');
      ptrIndicator.querySelector('span').textContent = 'Pull to refresh';
    });
  }

  // --- Render ---
  function render() {
    const boardView = document.getElementById("boardView");
    const agentsView = document.getElementById("agentsView");
    const statsView = document.getElementById("statsView");

    boardView.classList.add("hidden");
    agentsView.classList.add("hidden");
    statsView.classList.add("hidden");

    if (state.currentView === "board") {
      boardView.classList.remove("hidden");
      renderAgentFilter();
      renderBoard();
      renderFilterBar();
      initPullToRefresh();
    } else if (state.currentView === "agents") {
      agentsView.classList.remove("hidden");
      renderAgents();
    } else if (state.currentView === "stats") {
      statsView.classList.remove("hidden");
      renderStats();
    }
  }

  function formatDuration(ms) {
    if (!ms) return "\u2014";
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  }

  async function renderStats() {
    const view = document.getElementById("statsView");
    view.innerHTML = '<div style="padding:24px;color:var(--text-muted)">Loading stats...</div>';
    const stats = await api("/stats");

    const statusBars = Object.entries(stats.byStatus || {}).map(([s, c]) =>
      `<div class="stat-bar"><span class="stat-label">${s}</span><div class="stat-fill" style="width:${Math.max(5, (c / Math.max(stats.totalTasks, 1)) * 100)}%;background:var(--col-${s},#666)"></div><span class="stat-val">${c}</span></div>`
    ).join("");

    const agentRows = (stats.agentStats || []).map(a =>
      `<tr>
        <td><strong>${esc(a.agentId)}</strong></td>
        <td>${a.totalTasks}</td>
        <td>${a.completed}</td>
        <td>${a.failed}</td>
        <td>${a.inProgress}</td>
        <td>${formatDuration(a.avgDurationMs)}</td>
        <td>${(a.completionRate * 100).toFixed(0)}%</td>
      </tr>`
    ).join("");

    const oldest = stats.oldestDoingTask;
    const alertHtml = oldest && oldest.ageMs > 7200000
      ? `<div class="stat-alert">\u26A0 Stuck task: "${esc(oldest.title)}" (${esc(oldest.assignee)}) \u2014 in progress for ${formatDuration(oldest.ageMs)}</div>`
      : "";

    view.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-number">${stats.totalTasks}</div>
          <div class="stat-title">Total Tasks</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${(stats.completionRate * 100).toFixed(0)}%</div>
          <div class="stat-title">Completion Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${formatDuration(stats.avgDurationMs)}</div>
          <div class="stat-title">Avg Duration</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${stats.byStatus?.failed || 0}</div>
          <div class="stat-title">Failed</div>
        </div>
      </div>
      ${alertHtml}
      <h3 style="margin:24px 0 12px">Status Breakdown</h3>
      <div class="stat-bars">${statusBars}</div>
      <h3 style="margin:24px 0 12px">Agent Performance</h3>
      <table class="stats-table">
        <thead><tr><th>Agent</th><th>Total</th><th>Done</th><th>Failed</th><th>Active</th><th>Avg Time</th><th>Rate</th></tr></thead>
        <tbody>${agentRows || '<tr><td colspan="7">No agent data yet</td></tr>'}</tbody>
      </table>
    `;
  }

  // --- Filter Bar (mobile column tabs) ---
  let _filterBarScrollListener = null;

  function renderFilterBar() {
    const filterBar = document.getElementById("filterBar");
    if (!filterBar) return;
    // Only active on mobile
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile) { filterBar.innerHTML = ""; return; }

    const COL_COLORS = {
      backlog: "var(--col-backlog)", todo: "var(--col-todo)", doing: "var(--col-doing)",
      review: "var(--col-review)", done: "var(--col-done)", failed: "var(--col-failed)"
    };

    filterBar.innerHTML = COLUMNS.map((col) => {
      let tasks = state.tasks.filter((t) => t.column === col);
      if (!state.showArchived) tasks = tasks.filter((t) => !t.archived);
      if (state.filterAgent) tasks = tasks.filter((t) => t.assignee === state.filterAgent);
      const count = tasks.length;
      return `<button class="filter-tab" data-col="${col}">
        <span class="ft-dot" style="background:${COL_COLORS[col] || "#666"}"></span>
        ${COL_LABELS[col]}<span class="ft-count">${count}</span>
      </button>`;
    }).join("");

    const board = document.getElementById("boardView");

    // Click tab → scroll board to that column
    filterBar.querySelectorAll(".filter-tab").forEach((tab, idx) => {
      tab.addEventListener("click", () => {
        if (!board) return;
        const colEl = board.querySelector(`.column[data-col="${tab.dataset.col}"]`);
        if (colEl) {
          board.scrollTo({ left: colEl.offsetLeft, behavior: "smooth" });
        }
        // Update active state immediately
        filterBar.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        // Scroll filter bar to show active tab
        tab.scrollIntoView({ inline: "nearest", block: "nearest" });
      });
    });

    // Mark first tab as active initially
    const firstTab = filterBar.querySelector(".filter-tab");
    if (firstTab) firstTab.classList.add("active");

    // Sync active tab on board scroll
    if (_filterBarScrollListener && board) {
      board.removeEventListener("scroll", _filterBarScrollListener);
    }
    if (board) {
      _filterBarScrollListener = () => {
        const scrollLeft = board.scrollLeft;
        const colWidth = board.clientWidth;
        const colIndex = Math.round(scrollLeft / colWidth);
        const tabs = filterBar.querySelectorAll(".filter-tab");
        tabs.forEach((t, i) => t.classList.toggle("active", i === colIndex));
        // Auto-scroll filter bar to show active tab
        const activeTab = filterBar.querySelector(".filter-tab.active");
        if (activeTab) activeTab.scrollIntoView({ inline: "nearest", block: "nearest" });
      };
      board.addEventListener("scroll", _filterBarScrollListener, { passive: true });
    }
  }

  function renderBoard() {
    const board = document.getElementById("boardView");
    board.innerHTML = COLUMNS.map((col) => {
      let tasks = state.tasks.filter((t) => t.column === col);
      // Hide archived unless toggled
      if (!state.showArchived) {
        tasks = tasks.filter((t) => !t.archived);
      }
      // Apply agent filter if set
      if (state.filterAgent) {
        tasks = tasks.filter((t) => t.assignee === state.filterAgent);
      }
      const archiveAllBtn = (col === "done" && tasks.length > 0)
        ? `<button class="archive-all-btn" data-col="done">\uD83D\uDDC4 Archive all</button>`
        : "";
      return `
        <div class="column" data-col="${col}">
          <div class="column-header">
            <span><span class="dot" style="background:var(--col-${col})"></span>${COL_LABELS[col]}</span>
            <span class="count">${tasks.length}</span>
          </div>
          <div class="column-body" data-col="${col}">
            ${tasks.map(renderCard).join("")}
            ${archiveAllBtn}
            <button class="add-task-btn" data-col="${col}">+ Add task</button>
          </div>
        </div>`;
    }).join("");

    // Drag & drop
    board.querySelectorAll(".card").forEach(initDrag);
    board.querySelectorAll(".column-body").forEach(initDrop);

    // Swipe actions on cards (mobile)
    if (window.matchMedia('(max-width: 768px)').matches) {
      board.querySelectorAll(".card").forEach(initSwipeActions);
    }

    // Delete task buttons on cards
    board.querySelectorAll(".card-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const taskId = btn.dataset.deleteId;
        const task = state.tasks.find((t) => t.id === taskId);
        if (!task) return;
        if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
        await api("/tasks/" + taskId, { method: "DELETE" });
        await loadTasks();
        render();
      });
    });

    // Click to open detail
    board.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.defaultPrevented) return;
        openDetail(card.dataset.id);
      });
    });

    // Add task buttons
    board.querySelectorAll(".add-task-btn").forEach((btn) => {
      btn.addEventListener("click", () => showTaskModal(btn.dataset.col));
    });

    // Archive all done
    board.querySelectorAll(".archive-all-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const doneTasks = state.tasks.filter((t) => t.column === "done" && !t.archived);
        for (const t of doneTasks) {
          await api("/tasks/" + t.id, { method: "PATCH", body: JSON.stringify({ archived: true }) });
        }
        await loadTasks();
        render();
      });
    });
  }

  function getUnresolvedDeps(task) {
    if (!task.dependencies || !task.dependencies.length) return [];
    return task.dependencies
      .map((depId) => state.tasks.find((t) => t.id === depId))
      .filter((dep) => dep && dep.column !== "done");
  }

  function renderCard(task) {
    const priorityClass = `badge-priority-${task.priority}`;
    const tags = task.tags.map((t) => `<span class="badge badge-tag">${esc(t)}</span>`).join("");
    const comments = task.comments.length ? `<span class="card-comments">${task.comments.length} comment${task.comments.length > 1 ? "s" : ""}</span>` : "";

    // Check unresolved dependencies
    const blockers = getUnresolvedDeps(task);
    const lockHtml = blockers.length
      ? `<span class="badge badge-locked" title="Blocked by: ${blockers.map((b) => esc(b.title)).join(", ")}">&#x1F512; ${blockers.length} dep${blockers.length > 1 ? "s" : ""}</span>`
      : "";

    // Check if deadline is overdue
    let overdueClass = "";
    let deadlineHtml = "";
    if (task.deadline) {
      const deadlineDate = new Date(task.deadline);
      const now = new Date();
      const isOverdue = deadlineDate < now && task.column !== "done";
      overdueClass = isOverdue ? "card-overdue" : "";
      const deadlineStr = deadlineDate.toLocaleDateString();
      deadlineHtml = `<span class="badge badge-deadline ${isOverdue ? "badge-overdue" : ""}">${isOverdue ? "\u26A0 " : ""}\uD83D\uDCC5 ${deadlineStr}</span>`;
    }

    // Complexity + planning badges on card
    const complexHtml = task.complexity === "complex" ? '<span class="badge badge-complex">Complex</span>' : "";
    const planHtml = task.planningMode ? '<span class="badge badge-planning">\uD83D\uDCCB</span>' : "";

    return `
      <div class="card ${overdueClass} ${blockers.length ? "card-blocked" : ""}" draggable="true" data-id="${task.id}">
        <div class="card-header-row">
          <div class="card-title">${lockHtml ? lockHtml + " " : ""}${esc(task.title)}</div>
          <button class="card-delete-btn" data-delete-id="${task.id}" title="Delete task" aria-label="Delete">\uD83D\uDDD1</button>
        </div>
        ${task.description ? `<div class="card-desc">${esc(task.description)}</div>` : ""}
        <div class="card-meta">
          ${task.assignee ? `<span class="badge badge-assignee">${esc(task.assignee)}</span>` : ""}
          <span class="badge ${priorityClass}">${task.priority}</span>
          ${complexHtml}
          ${planHtml}
          ${tags}
          ${deadlineHtml}
          ${comments}
        </div>
      </div>`;
  }

  function renderAgents() {
    const view = document.getElementById("agentsView");
    if (!state.agents.length) {
      view.innerHTML = '<div style="padding:24px;color:var(--text-muted)">No agents registered. Use the API to register agents.</div>';
      return;
    }
    view.innerHTML = state.agents.map((a) => {
      const taskCount = state.tasks.filter((t) => t.assignee === a.id).length;
      return `
        <div class="agent-card">
          <h3>${esc(a.name)}</h3>
          <div class="role">${esc(a.role)} &middot; ${a.status} &middot; ${taskCount} task${taskCount !== 1 ? "s" : ""}</div>
          <div class="caps">${a.capabilities.map((c) => `<span class="badge badge-tag">${esc(c)}</span>`).join("")}</div>
        </div>`;
    }).join("");
  }

  // --- Swipe Actions (Mobile) ---
  function initSwipeActions(card) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;
    const taskId = card.dataset.id;
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    card.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isSwiping = true;
      card.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const diffX = x - startX;
      const diffY = y - startY;
      
      // Only handle horizontal swipes
      if (Math.abs(diffX) > Math.abs(diffY)) {
        e.preventDefault();
        currentX = diffX;
        
        // Limit swipe distance
        const clampedX = Math.max(-100, Math.min(100, diffX));
        card.style.transform = `translateX(${clampedX}px)`;
        
        // Add visual feedback classes
        card.classList.toggle('swiping-left', diffX < -50);
        card.classList.toggle('swiping-right', diffX > 50);
      }
    }, { passive: false });

    card.addEventListener('touchend', async () => {
      if (!isSwiping) return;
      isSwiping = false;
      card.style.transition = 'transform 0.2s ease';
      card.classList.remove('swiping-left', 'swiping-right');
      
      // Check if swipe was far enough to trigger action
      if (currentX < -100 && task.column !== 'done') {
        // Swipe left - complete task
        card.style.transform = 'translateX(-100%)';
        setTimeout(async () => {
          await api("/tasks/" + taskId + "/move", { method: "POST", body: JSON.stringify({ column: "done" }) });
          await loadTasks();
          render();
        }, 200);
      } else if (currentX > 100) {
        // Swipe right - delete with confirmation
        card.style.transform = 'translateX(100%)';
        if (confirm(`Delete "${task.title}"?`)) {
          setTimeout(async () => {
            await api("/tasks/" + taskId, { method: "DELETE" });
            await loadTasks();
            render();
          }, 200);
        } else {
          card.style.transform = 'translateX(0)';
        }
      } else {
        // Snap back
        card.style.transform = 'translateX(0)';
      }
      
      currentX = 0;
    });
  }

  // --- Drag & Drop ---
  let draggedId = null;

  function initDrag(card) {
    // Desktop: HTML5 drag & drop
    card.addEventListener("dragstart", (e) => {
      draggedId = card.dataset.id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      card.style.touchAction = "";
      draggedId = null;
    });

    // Mobile: touch drag via Pointer Events
    let isDragging = false;
    let ghost = null;
    let startX = 0, startY = 0;
    let touchTimer = null;

    card.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      startX = e.clientX;
      startY = e.clientY;
      touchTimer = setTimeout(() => {
        isDragging = true;
        draggedId = card.dataset.id;
        ghost = card.cloneNode(true);
        const rect = card.getBoundingClientRect();
        ghost.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${card.offsetWidth}px;opacity:0.75;pointer-events:none;z-index:9999;transform:rotate(2deg) scale(1.03);transition:none;`;
        document.body.appendChild(ghost);
        card.classList.add("dragging");
        card.style.touchAction = "none";
        navigator.vibrate && navigator.vibrate(30);
      }, 200);
    });

    card.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") return;
      if (!isDragging) {
        if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) clearTimeout(touchTimer);
        return;
      }
      e.preventDefault();
      if (ghost) {
        ghost.style.top = (e.clientY - ghost.offsetHeight / 2) + "px";
        ghost.style.left = (e.clientX - ghost.offsetWidth / 2) + "px";
        ghost.style.display = "none";
        const el = document.elementFromPoint(e.clientX, e.clientY);
        ghost.style.display = "";
        document.querySelectorAll(".col-body").forEach(c => c.classList.remove("drag-over"));
        const colBody = el && el.closest(".col-body");
        if (colBody) colBody.classList.add("drag-over");
      }
    });

    const endDrag = async (e) => {
      if (e.pointerType === "mouse") return;
      clearTimeout(touchTimer);
      if (!isDragging) return;
      isDragging = false;
      if (ghost) { ghost.remove(); ghost = null; }
      card.classList.remove("dragging");
      card.style.touchAction = "";
      document.querySelectorAll(".col-body").forEach(c => c.classList.remove("drag-over"));
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const colBody = el && el.closest(".col-body");
      const newCol = colBody && colBody.dataset.col;
      if (newCol && draggedId) {
        await api("/tasks/" + draggedId + "/move", { method: "POST", body: JSON.stringify({ column: newCol }) });
        await loadTasks();
        render();
      }
      draggedId = null;
    };

    card.addEventListener("pointerup", endDrag);
    card.addEventListener("pointercancel", endDrag);
  }

  function initDrop(colBody) {
    colBody.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      colBody.classList.add("drag-over");
    });
    colBody.addEventListener("dragleave", () => {
      colBody.classList.remove("drag-over");
    });
    colBody.addEventListener("drop", async (e) => {
      e.preventDefault();
      colBody.classList.remove("drag-over");
      if (!draggedId) return;
      const newCol = colBody.dataset.col;
      await api("/tasks/" + draggedId + "/move", {
        method: "POST",
        body: JSON.stringify({ column: newCol }),
      });
      await loadTasks();
      render();
    });
  }

  // --- Task Detail Panel ---
  const detailPanel = document.getElementById("detailPanel");
  const detailContent = document.getElementById("detailContent");
  let threadInterval = null;
  let currentDetailTaskId = null;

  // --- Panel open/close with iOS body scroll lock ---
  function _openPanel() {
    detailPanel.classList.add('open');
    if (window.matchMedia('(max-width: 768px)').matches) {
      const scrollY = window.scrollY || window.pageYOffset;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      document.body.classList.add('detail-panel-open');
      document.body.dataset.panelScrollY = scrollY;
      const backdrop = document.getElementById('detailBackdrop');
      if (backdrop) {
        backdrop.classList.add('active');
        backdrop.onclick = () => _closePanel();
      }
    }
  }
  function _closePanel() {
    detailPanel.classList.remove('open');
    const scrollY = parseInt(document.body.dataset.panelScrollY || '0');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.top = '';
    document.body.classList.remove('detail-panel-open');
    if (scrollY) window.scrollTo(0, scrollY);
    delete document.body.dataset.panelScrollY;
    const backdrop = document.getElementById('detailBackdrop');
    if (backdrop) backdrop.classList.remove('active');
  }

  document.getElementById("closeDetail").addEventListener("click", () => {
    _closePanel();
    if (threadInterval) { clearInterval(threadInterval); threadInterval = null; }
    currentDetailTaskId = null;
  });

  // Swipe to close detail panel (mobile)
  function initDetailSwipe() {
    if (window.matchMedia('(min-width: 769px)').matches) return;
    
    let startY = 0;
    let currentY = 0;
    let isSwiping = false;
    
    detailPanel.addEventListener('touchstart', (e) => {
      // Only allow swipe from drag handle area or header
      if (e.target.closest('.detail-header') || e.clientY < 100) {
        startY = e.touches[0].clientY;
        isSwiping = true;
        detailPanel.classList.add('swiping');
      }
    }, { passive: true });
    
    detailPanel.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      
      if (diff > 0) {
        detailPanel.style.transform = `translateY(${diff}px)`;
      }
    }, { passive: true });
    
    detailPanel.addEventListener('touchend', () => {
      if (!isSwiping) return;
      isSwiping = false;
      detailPanel.classList.remove('swiping');
      
      const diff = currentY - startY;
      
      if (diff > 100) {
        // Close
        detailPanel.style.transform = 'translateY(100%)';
        setTimeout(() => {
          _closePanel();
          detailPanel.style.transform = '';
          if (threadInterval) { clearInterval(threadInterval); threadInterval = null; }
          currentDetailTaskId = null;
        }, 200);
      } else {
        // Snap back
        detailPanel.style.transform = '';
      }
    });
  }
  
  initDetailSwipe();

  // --- Timeline helpers ---
  function getMessageType(c) {
    if (c.author === "system") return "system";
    if (c.text.startsWith("\u270D\uFE0F")) return "tz";
    if (c.text.startsWith("\u2705")) return "report";
    if (c.text.startsWith("\uD83D\uDD04")) return "rework";
    if (c.text.startsWith("\u26A1")) return "escalation";
    return "message";
  }

  function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " \u00B7 " + d.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function renderTimeline(comments) {
    const el = document.getElementById("timelineMessages");
    if (!el) return;
    if (!comments.length) {
      el.innerHTML = '<div class="tl-empty">No activity yet.</div>';
      return;
    }
    const sorted = [...comments].sort((a, b) => new Date(a.at) - new Date(b.at));
    el.innerHTML = sorted.map((c) => {
      const type = getMessageType(c);
      if (type === "system") {
        return `<div class="tl-msg tl-system"><span>${esc(c.text)}</span><span class="tl-time">${fmtTime(c.at)}</span></div>`;
      }
      const badges = { tz: "TZ", report: "Report", escalation: "Escalation" };
      const badge = badges[type] ? `<span class="tl-badge tl-badge-${type}">${badges[type]}</span>` : "";
      return `<div class="tl-msg tl-${type}">
        <div class="tl-header"><span class="tl-author">${esc(c.author)}</span>${badge}<span class="tl-time">${fmtTime(c.at)}</span></div>
        <div class="tl-text">${esc(c.text)}</div>
      </div>`;
    }).join("");
    el.scrollTop = el.scrollHeight;
  }

  async function refreshTimeline(taskId) {
    try {
      const comments = await api("/tasks/" + taskId + "/comments");
      if (currentDetailTaskId === taskId) renderTimeline(comments);
    } catch (e) { /* ignore polling errors */ }
  }

  function openDetail(taskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    currentDetailTaskId = taskId;

    const complexBadge = task.complexity === "complex" ? '<span class="badge badge-complex">Complex</span>' : "";
    const planningBadge = task.planningMode ? '<span class="badge badge-planning">\uD83D\uDCCB Planning</span>' : "";
    const escalateBtn = task.assignee !== "pasha" && task.complexity !== "complex"
      ? '<button class="btn-escalate" id="escalateBtn">\u26A1 Escalate to Pasha</button>'
      : "";
    const archiveBtn = (task.column === "done" || task.column === "failed") && !task.archived
      ? '<button class="btn-archive" id="archiveBtn">\uD83D\uDDC4 Archive</button>'
      : "";
    const deleteBtn = '<button class="btn-delete" id="deleteBtn">\uD83D\uDDD1 Delete</button>';
    const unarchivedBadge = task.archived ? '<span class="badge badge-archived">Archived</span>' : "";

    const atts = task.attachments || [];
    const attHtml = atts.map((a) => {
      if (a.mimeType && a.mimeType.startsWith("image/")) {
        return `<img class="attachment-thumb" src="data:${a.mimeType};base64,${a.data}" title="${esc(a.filename)}" onclick="window.open(this.src)">`;
      }
      return `<span class="attachment-file" title="${esc(a.filename)}">\uD83D\uDCCE ${esc(a.filename)}</span>`;
    }).join("");

    const approveLabel = task.planningMode ? "\u2705 Approve TZ" : "\u2705 Approve";
    const reviewHtml = task.column === "review" ? `
      <div class="detail-actions">
        <button class="btn-approve" id="approveBtn">${approveLabel}</button>
      </div>
    ` : "";

    detailContent.innerHTML = `
      <div class="detail-header">
        <h2>${esc(task.title)}</h2>
        <div class="detail-meta-row">
          <span class="badge" style="background:var(--col-${task.column});color:#fff">${task.column}</span>
          ${task.assignee ? `<span class="badge badge-assignee">${esc(task.assignee)}</span>` : ""}
          <span class="badge badge-priority-${task.priority}">${task.priority}</span>
          ${complexBadge}
          ${planningBadge}
          ${unarchivedBadge}
          ${task.tags.map((t) => `<span class="badge badge-tag">${esc(t)}</span>`).join("")}
        </div>
        ${task.description ? `<div class="detail-desc">${esc(task.description)}</div>` : ""}
        <div class="detail-header-actions">${escalateBtn}${archiveBtn}${deleteBtn}</div>
      </div>
      ${task.technicalSpec ? `
      <div class="detail-spec-section">
        <div class="detail-spec-toggle" id="toggleSpec">
          <span class="detail-spec-icon">📋</span>
          <span class="detail-spec-label">Техническое задание (ТЗ)</span>
          <span class="detail-spec-arrow">▼</span>
        </div>
        <div class="detail-spec-body" id="specBody">
          <pre class="detail-spec-content">${esc(task.technicalSpec)}</pre>
        </div>
      </div>` : ""}
      ${task.completionReport ? `
      <div class="detail-spec-section detail-report-section">
        <div class="detail-spec-toggle" id="toggleReport">
          <span class="detail-spec-icon">📊</span>
          <span class="detail-spec-label">Отчёт о выполнении</span>
          <span class="detail-spec-arrow">▼</span>
        </div>
        <div class="detail-spec-body" id="reportBody">
          <pre class="detail-spec-content">${esc(task.completionReport)}</pre>
        </div>
      </div>` : ""}
      <div class="timeline-container" id="timelineMessages"></div>
      <div class="timeline-input">
        <input type="text" id="commentAuthor" placeholder="steve" value="steve" class="tl-author-input">
        <div class="tl-send-row">
          <input type="text" id="commentText" placeholder="Message..." class="tl-text-input">
          <button class="btn btn-primary" id="addCommentBtn">Send</button>
        </div>
      </div>
      ${reviewHtml}
      <div class="detail-attachments">
        <div class="detail-attach-toggle" id="toggleAttachments">\uD83D\uDCCE Attachments (${atts.length})</div>
        <div class="detail-attach-body" id="attachBody">
          <div class="attachment-grid" id="attachmentGrid">${attHtml}</div>
          <button class="btn-attach" id="attachBtn">\uD83D\uDCCE Attach file</button>
        </div>
      </div>
    `;

    renderTimeline(task.comments);

    // Toggle technicalSpec section
    const specToggle = document.getElementById("toggleSpec");
    if (specToggle) {
      specToggle.addEventListener("click", () => {
        const body = document.getElementById("specBody");
        const arrow = specToggle.querySelector(".detail-spec-arrow");
        if (body) {
          body.classList.toggle("collapsed");
          if (arrow) arrow.textContent = body.classList.contains("collapsed") ? "▶" : "▼";
        }
      });
    }

    // Toggle completionReport section
    const reportToggle = document.getElementById("toggleReport");
    if (reportToggle) {
      reportToggle.addEventListener("click", () => {
        const body = document.getElementById("reportBody");
        const arrow = reportToggle.querySelector(".detail-spec-arrow");
        if (body) {
          body.classList.toggle("collapsed");
          if (arrow) arrow.textContent = body.classList.contains("collapsed") ? "▶" : "▼";
        }
      });
    }

    // On mobile: collapse spec/report sections by default so comments are visible
    if (window.matchMedia("(max-width: 768px)").matches) {
      const specBody = document.getElementById("specBody");
      const reportBody = document.getElementById("reportBody");
      if (specBody && task.technicalSpec) {
        specBody.classList.add("collapsed");
        const a = specToggle && specToggle.querySelector(".detail-spec-arrow");
        if (a) a.textContent = "▶";
      }
      if (reportBody && task.completionReport) {
        reportBody.classList.add("collapsed");
        const a = reportToggle && reportToggle.querySelector(".detail-spec-arrow");
        if (a) a.textContent = "▶";
      }
      // Scroll detail content to top to show title and comments
      const detailContent = document.getElementById("detailContent");
      if (detailContent) setTimeout(() => { detailContent.scrollTop = 0; }, 50);
    }

    // Send comment
    async function sendComment() {
      const author = document.getElementById("commentAuthor").value.trim() || "steve";
      const text = document.getElementById("commentText").value.trim();
      if (!text) return;
      document.getElementById("commentText").value = "";
      await api("/tasks/" + taskId + "/comments", {
        method: "POST",
        body: JSON.stringify({ author, text }),
      });
      await refreshTimeline(taskId);
      await loadTasks();
    }

    document.getElementById("addCommentBtn").addEventListener("click", sendComment);
    const commentTextEl = document.getElementById("commentText");
    commentTextEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); }
    });
    
    // Focus handler for mobile - scroll into view when keyboard opens
    commentTextEl.addEventListener('focus', () => {
      setTimeout(() => {
        if (window.matchMedia('(max-width: 768px)').matches) {
          commentTextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });

    // Escalate to Pasha
    const escBtn = document.getElementById("escalateBtn");
    if (escBtn) {
      escBtn.addEventListener("click", async () => {
        await api("/tasks/" + taskId, {
          method: "PATCH",
          body: JSON.stringify({ complexity: "complex", assignee: "pasha" }),
        });
        await api("/tasks/" + taskId + "/comments", {
          method: "POST",
          body: JSON.stringify({ author: "system", text: "\u26A1 Escalated to Pasha for architectural analysis" }),
        });
        if (task.column !== "todo") {
          await api("/tasks/" + taskId + "/move", {
            method: "POST",
            body: JSON.stringify({ column: "todo" }),
          });
        }
        await loadTasks();
        openDetail(taskId);
      });
    }

    // Archive task
    const archBtn = document.getElementById("archiveBtn");
    if (archBtn) {
      archBtn.addEventListener("click", async () => {
        await api("/tasks/" + taskId, { method: "PATCH", body: JSON.stringify({ archived: true }) });
        _closePanel();
        await loadTasks();
        render();
      });
    }

    // Delete task
    const delBtn = document.getElementById("deleteBtn");
    if (delBtn) {
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
        await api("/tasks/" + taskId, { method: "DELETE" });
        _closePanel();
        await loadTasks();
        render();
      });
    }

    // Toggle attachments
    document.getElementById("toggleAttachments").addEventListener("click", () => {
      document.getElementById("attachBody").classList.toggle("hidden");
    });

    // Review actions
    if (task.column === "review") {
      document.getElementById("approveBtn").addEventListener("click", async () => {
        await api("/tasks/" + taskId + "/move", { method: "POST", body: JSON.stringify({ column: "done" }) });
        _closePanel();
        await loadTasks();
        render();
      });

    }

    // Attachment upload
    const attachBtn = document.getElementById("attachBtn");
    const fileInput = document.getElementById("attachFileInput");
    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        const [header, data] = dataUrl.split(",");
        const mimeType = header.match(/:(.*?);/)[1];
        await api("/tasks/" + taskId + "/attachments", {
          method: "POST",
          body: JSON.stringify({ filename: file.name, mimeType, data, uploadedBy: "user" }),
        });
        fileInput.value = "";
        await loadTasks();
        const updated = state.tasks.find((t) => t.id === taskId);
        if (updated) openDetail(taskId);
      };
      reader.readAsDataURL(file);
    });

    // Auto-refresh timeline every 10s
    if (threadInterval) clearInterval(threadInterval);
    threadInterval = setInterval(() => refreshTimeline(taskId), 10000);

    _openPanel();
  }

  // --- Modals ---
  function showModal(html, options = {}) {
    const { fullscreen = true, preventSwipe = false } = options;
    
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal ${fullscreen ? 'modal-fullscreen' : ''}">
      <div class="modal-drag-handle" role="button" aria-label="Drag to dismiss" tabindex="0"></div>
      <button class="modal-collapse-btn" title="Collapse/Expand" aria-label="Collapse or expand">▼</button>
      <div class="modal-content-scrollable">${html}</div>
    </div>`;
    document.body.appendChild(overlay);
    
    const modal = overlay.querySelector('.modal');
    const dragHandle = overlay.querySelector('.modal-drag-handle');
    const collapseBtn = overlay.querySelector('.modal-collapse-btn');
    const content = overlay.querySelector('.modal-content-scrollable');
    let isCollapsed = false;
    
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    
    // Close on overlay click (but not when clicking modal content)
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        modal.classList.add('closing');
        setTimeout(() => overlay.remove(), 300);
      }
    });
    
    // Collapse/expand functionality
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        modal.classList.toggle('collapsed', isCollapsed);
        collapseBtn.textContent = isCollapsed ? '▲' : '▼';
        collapseBtn.setAttribute('aria-expanded', !isCollapsed);
        
        // Scroll to top when expanding
        if (!isCollapsed && content) {
          content.scrollTop = 0;
        }
      });
    }
    
    // Swipe to close (mobile) - iOS pattern
    let touchStartY = 0;
    let touchStartX = 0;
    let isSwiping = false;
    let startTime = 0;
    
    const handleTouchStart = (e) => {
      // Don't handle if touching input, textarea, or select
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      
      // Only allow swipe from drag handle or top area
      const isDragHandle = e.target.classList.contains('modal-drag-handle');
      const isTopArea = e.touches[0].clientY < 120;
      
      if (!isDragHandle && !isTopArea) return;
      
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      startTime = Date.now();
      isSwiping = true;
      modal.style.transition = 'none';
    };
    
    const handleTouchMove = (e) => {
      if (!isSwiping || preventSwipe) return;
      
      const touchY = e.touches[0].clientY;
      const touchX = e.touches[0].clientX;
      const deltaY = touchY - touchStartY;
      const deltaX = touchX - touchStartX;
      
      // Only handle vertical swipes downward
      if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0) {
        e.preventDefault();
        // Swiping down - add resistance
        const resistance = deltaY * 0.6;
        modal.style.transform = `translateY(${resistance}px)`;
        overlay.style.background = `rgba(0,0,0,${Math.max(0, 0.6 - deltaY / 600)})`;
      }
    };
    
    const handleTouchEnd = (e) => {
      if (!isSwiping) return;
      isSwiping = false;
      
      const touchY = e.changedTouches[0].clientY;
      const deltaY = touchY - touchStartY;
      const deltaTime = Date.now() - startTime;
      const velocity = deltaY / deltaTime;
      
      modal.style.transition = '';
      overlay.style.transition = '';
      
      // Close threshold: 100px or fast swipe (velocity > 0.5)
      if (deltaY > 100 || (deltaY > 60 && velocity > 0.5)) {
        modal.style.transform = `translateY(100vh)`;
        overlay.style.background = 'rgba(0,0,0,0)';
        setTimeout(() => overlay.remove(), 350);
      } else {
        // Snap back with bounce effect
        modal.style.transform = '';
        overlay.style.background = '';
      }
    };
    
    // Attach swipe handlers
    if (!preventSwipe) {
      if (dragHandle) {
        dragHandle.addEventListener('touchstart', handleTouchStart, { passive: true });
        dragHandle.addEventListener('touchmove', handleTouchMove, { passive: false });
        dragHandle.addEventListener('touchend', handleTouchEnd);
        
        // Keyboard accessibility for drag handle
        dragHandle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            modal.classList.add('closing');
            setTimeout(() => overlay.remove(), 300);
          }
        });
      }
      
      // Also allow swipe from modal content top area
      modal.addEventListener('touchstart', handleTouchStart, { passive: true });
      modal.addEventListener('touchmove', handleTouchMove, { passive: false });
      modal.addEventListener('touchend', handleTouchEnd);
    }
    
    // Handle keyboard visibility changes (iOS keyboard handling)
    const originalWindowHeight = window.innerHeight;
    const originalVisualHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    let keyboardOpen = false;
    
    const handleResize = () => {
      // Use visualViewport for iOS if available
      const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const heightDiff = originalWindowHeight - currentHeight;
      const isKeyboardOpen = heightDiff > 150;
      
      if (isKeyboardOpen !== keyboardOpen) {
        keyboardOpen = isKeyboardOpen;
        
        if (keyboardOpen && isMobile) {
          document.body.classList.add('keyboard-open');
          // Adjust modal for keyboard
          modal.style.maxHeight = '55vh';
          modal.style.borderRadius = '20px 20px 0 0';
        } else {
          document.body.classList.remove('keyboard-open');
          if (!isCollapsed) {
            modal.style.maxHeight = '';
            modal.style.borderRadius = '';
          }
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }
    
    // Handle focus on inputs to scroll into view (iOS fix)
    const inputs = modal.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('focus', (e) => {
        // Prevent zoom on iOS by ensuring font-size is 16px
        if (isIOS && input.type !== 'checkbox' && input.type !== 'file') {
          input.style.fontSize = '16px';
        }
        
        // Scroll into view with delay for keyboard animation
        setTimeout(() => {
          if (isMobile) {
            const rect = input.getBoundingClientRect();
            const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const keyboardHeight = window.innerHeight - viewportHeight;
            
            // If input is below keyboard, scroll it into view
            if (rect.bottom > viewportHeight - 20) {
              const scrollOffset = rect.bottom - viewportHeight + 100;
              content.scrollBy({ top: scrollOffset, behavior: 'smooth' });
            }
          }
        }, isIOS ? 400 : 200);
      });
      
      // Handle blur to reset styles
      input.addEventListener('blur', () => {
        if (isIOS) {
          input.style.fontSize = '';
        }
      });
    });
    
    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.classList.add('closing');
        setTimeout(() => overlay.remove(), 300);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Prevent body scroll when modal is open (iOS fix)
    const preventBodyScroll = (e) => {
      if (isMobile && e.target === document.body) {
        e.preventDefault();
      }
    };
    document.body.addEventListener('touchmove', preventBodyScroll, { passive: false });
    
    // Cleanup on remove
    const originalRemove = overlay.remove.bind(overlay);
    overlay.remove = () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
      document.removeEventListener('keydown', handleEscape);
      document.body.removeEventListener('touchmove', preventBodyScroll);
      document.body.classList.remove('keyboard-open');
      originalRemove();
    };
    
    return overlay;
  }

  document.getElementById("newProjectBtn").addEventListener("click", () => {
    const overlay = showModal(`
      <h2>New Project</h2>
      <label>Name</label>
      <input type="text" id="modalProjName" autofocus autocomplete="off">
      <label>Owner</label>
      <input type="text" id="modalProjOwner" placeholder="e.g. agency" autocomplete="off">
      <label>Description</label>
      <textarea id="modalProjDesc" rows="2"></textarea>
      <div class="modal-actions">
        <button class="btn" id="modalCancel" type="button">Cancel</button>
        <button class="btn btn-primary" id="modalConfirm" type="button">Create</button>
      </div>
    `);
    overlay.querySelector("#modalCancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#modalConfirm").addEventListener("click", async () => {
      const name = overlay.querySelector("#modalProjName").value.trim();
      if (!name) return;
      const project = await api("/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          owner: overlay.querySelector("#modalProjOwner").value.trim() || "unknown",
          description: overlay.querySelector("#modalProjDesc").value.trim(),
        }),
      });
      state.currentProject = project.id;
      overlay.remove();
      await refresh();
    });
  });

  function showTaskModal(column) {
    if (!state.currentProject) return;
    const overlay = showModal(`
      <h2>New Task</h2>
      <label>Title *</label>
      <input type="text" id="modalTaskTitle" autofocus autocomplete="off" enterkeyhint="next">
      <label>Description</label>
      <textarea id="modalTaskDesc" rows="3" enterkeyhint="next"></textarea>
      <label>Assignee</label>
      <input type="text" id="modalTaskAssignee" placeholder="org" autocomplete="off" enterkeyhint="next">
      <label>Priority</label>
      <select id="modalTaskPriority">
        <option value="medium" selected>Medium</option>
        <option value="low">Low</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <label>Tags (comma-separated)</label>
      <input type="text" id="modalTaskTags" placeholder="seo, audit" autocomplete="off" enterkeyhint="done">
      <div class="modal-modes">
        <label class="modal-mode-item" id="planningModeToggle">
          <div class="modal-mode-info">
            <span class="modal-mode-icon">📋</span>
            <div>
              <div class="modal-mode-title">Planning mode</div>
              <div class="modal-mode-desc">TZ согласовывается со Steve перед запуском</div>
            </div>
          </div>
          <div class="toggle-switch">
            <input type="checkbox" id="modalPlanningMode">
            <span class="toggle-thumb"></span>
          </div>
        </label>
        <label class="modal-mode-item" id="complexModeToggle">
          <div class="modal-mode-info">
            <span class="modal-mode-icon">⚡</span>
            <div>
              <div class="modal-mode-title">Complex → Pasha</div>
              <div class="modal-mode-desc">Архитектурный анализ перед исполнением</div>
            </div>
          </div>
          <div class="toggle-switch">
            <input type="checkbox" id="modalComplexMode">
            <span class="toggle-thumb"></span>
          </div>
        </label>
      </div>
      <label>📎 Attachments</label>
      <div class="modal-file-drop" id="modalFileDrop">
        <input type="file" id="modalFileInput" multiple accept="image/*,.pdf,.txt,.md,.json">
        <span class="modal-file-drop-text">Tap to choose files</span>
      </div>
      <div class="modal-file-list" id="modalFileList"></div>
      <div class="modal-actions">
        <button class="btn" id="modalCancel" type="button">Cancel</button>
        <button class="btn btn-primary" id="modalConfirm" type="button">Create</button>
      </div>
    `);

    // Complex mode → auto-set assignee to pasha
    const complexCb = overlay.querySelector("#modalComplexMode");
    const assigneeInput = overlay.querySelector("#modalTaskAssignee");
    complexCb.addEventListener("change", () => {
      if (complexCb.checked) {
        assigneeInput.value = "pasha";
        assigneeInput.readOnly = true;
        assigneeInput.style.opacity = "0.6";
      } else {
        assigneeInput.readOnly = false;
        assigneeInput.style.opacity = "1";
        if (assigneeInput.value === "pasha") assigneeInput.value = "";
      }
    });

    // File list preview
    const fileInput = overlay.querySelector("#modalFileInput");
    const fileList = overlay.querySelector("#modalFileList");
    fileInput.addEventListener("change", () => {
      fileList.innerHTML = [...fileInput.files].map((f) =>
        `<span class="modal-file-item">\uD83D\uDCCE ${esc(f.name)}</span>`
      ).join("");
    });

    overlay.querySelector("#modalCancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#modalConfirm").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = "Creating...";

      const title = overlay.querySelector("#modalTaskTitle").value.trim();
      if (!title) {
        btn.disabled = false;
        btn.textContent = "Create";
        return;
      }
      const tags = overlay.querySelector("#modalTaskTags").value.trim();
      const isComplex = overlay.querySelector("#modalComplexMode").checked;
      const isPlanning = overlay.querySelector("#modalPlanningMode").checked;
      const assignee = assigneeInput.value.trim() || "org";

      // Create task
      const task = await api("/tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId: state.currentProject,
          title,
          description: overlay.querySelector("#modalTaskDesc").value.trim(),
          assignee,
          priority: overlay.querySelector("#modalTaskPriority").value,
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          column: column || "backlog",
          complexity: isComplex ? "complex" : "normal",
          planningMode: isPlanning,
        }),
      });

      // Upload attachments if any
      const files = fileInput.files;
      if (files.length && task && task.id) {
        for (const file of files) {
          await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
              const dataUrl = e.target.result;
              const [header, data] = dataUrl.split(",");
              const mimeType = header.match(/:(.*?);/)[1];
              await api("/tasks/" + task.id + "/attachments", {
                method: "POST",
                body: JSON.stringify({ filename: file.name, mimeType, data, uploadedBy: "steve" }),
              });
              resolve();
            };
            reader.readAsDataURL(file);
          });
        }
      }

      overlay.remove();
      await loadTasks();
      render();
    }, { once: true });
  }

  document.getElementById("newTaskBtn").addEventListener("click", () => showTaskModal("backlog"));

  // --- Escape ---
  function esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Init ---
  refresh();

  // Auto-refresh every 5s
  setInterval(async () => {
    await loadTasks();
    if (state.currentView === "board") renderBoard();
  }, 5000);

  // ============================================
  // MOBILE-FIRST ENHANCEMENTS
  // ============================================

  // --- Collapsible Columns ---
  function initCollapsibleColumns() {
    document.querySelectorAll('.column-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const column = e.currentTarget.closest('.column');
        if (!column) return;
        column.classList.toggle('collapsed');
      });
    });
  }

  // Hook into renderBoard
  const originalRenderBoard = renderBoard;
  renderBoard = function() {
    originalRenderBoard();
    initCollapsibleColumns();
  };

  // --- Bottom Sheet Drag to Dismiss ---
  let sheetStartY = 0;
  let isDraggingSheet = false;
  
  function initBottomSheet() {
    const panel = document.getElementById('detailPanel');
    if (!panel) return;
    
    panel.addEventListener('touchstart', (e) => {
      if (!panel.classList.contains('open')) return;
      const touchY = e.touches[0].clientY;
      const panelRect = panel.getBoundingClientRect();
      if (touchY - panelRect.top < 80) {
        sheetStartY = touchY;
        isDraggingSheet = true;
        panel.style.transition = 'none';
      }
    }, { passive: true });
    
    panel.addEventListener('touchmove', (e) => {
      if (!isDraggingSheet) return;
      const deltaY = e.touches[0].clientY - sheetStartY;
      if (deltaY > 0) {
        e.preventDefault();
        panel.style.transform = `translateY(${deltaY}px)`;
      }
    }, { passive: false });
    
    panel.addEventListener('touchend', (e) => {
      if (!isDraggingSheet) return;
      isDraggingSheet = false;
      panel.style.transition = '';
      const deltaY = e.changedTouches[0].clientY - sheetStartY;
      if (deltaY > 100) {
        panel.style.transform = 'translateY(100%)';
        setTimeout(() => {
          _closePanel();
          panel.style.transform = '';
          if (threadInterval) { clearInterval(threadInterval); threadInterval = null; }
          currentDetailTaskId = null;
        }, 200);
      } else {
        panel.style.transform = '';
      }
    });
  }

  // --- FAB Logic ---
  function initFAB() {
    const fabMain = document.getElementById('fabMain');
    const fabMenu = document.getElementById('fabMenu');
    if (!fabMain) return;
    
    let isOpen = false;
    fabMain.addEventListener('click', () => {
      isOpen = !isOpen;
      fabMenu.classList.toggle('open', isOpen);
      fabMain.textContent = isOpen ? '✕' : '+';
    });
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.fab-container') && isOpen) {
        isOpen = false;
        fabMenu.classList.remove('open');
        fabMain.textContent = '+';
      }
    });
    
    const fabNewProject = document.getElementById('fabNewProject');
    const fabNewTask = document.getElementById('fabNewTask');
    
    if (fabNewProject) {
      fabNewProject.addEventListener('click', () => {
        document.getElementById('newProjectBtn')?.click();
        isOpen = false;
        fabMenu.classList.remove('open');
        fabMain.textContent = '+';
      });
    }
    
    if (fabNewTask) {
      fabNewTask.addEventListener('click', () => {
        showTaskModal('backlog');
        isOpen = false;
        fabMenu.classList.remove('open');
        fabMain.textContent = '+';
      });
    }
  }

  // Initialize mobile features
  document.addEventListener('DOMContentLoaded', () => {
    initFAB();
    initBottomSheet();
  });
})();
