/**
 * app.js
 * Main application controller: wires data, calculation engine,
 * localization, and DOM rendering together.
 */

import Translations from "./translations.js";
import {
  getSemesters,
  addSemester,
  removeSemester,
  updateSemesterNumber,
  addSubjectToSemester,
  removeSubjectFromSemester,
  updateSubject,
  addAssessment,
  removeAssessment,
  updateAssessment,
  loadCourseCatalogue,
  resetData,
  saveState,
  loadState,
  clearState,
} from "./data.js";
import CalculationEngine from "./calculationEngine.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentLang = "hu";
let courseCatalogue = []; // loaded from courses.json
let activeSemesterIdx = 0; // index of the semester currently being edited
let dashboardTab = "current"; // "current" | "cumulative"
let currentTheme = "light"; // "light" | "dark"
let sidebarOpen = true; // sidebar visibility state
let collapsedSemesters = new Set(); // semester numbers that are collapsed

function t(key) {
  return Translations[currentLang][key] ?? key;
}

// ---------------------------------------------------------------------------
// Debounced auto-save
// ---------------------------------------------------------------------------
let _saveTimer = null;
const SAVE_DELAY = 500; // ms

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveState({ lang: currentLang, theme: currentTheme, sidebarOpen, collapsedSemesters: [...collapsedSemesters] });
  }, SAVE_DELAY);
}

/** Save immediately (e.g. before unload). */
function saveNow() {
  clearTimeout(_saveTimer);
  saveState({ lang: currentLang, theme: currentTheme, sidebarOpen, collapsedSemesters: [...collapsedSemesters] });
}

// ---------------------------------------------------------------------------
// Language switching
// ---------------------------------------------------------------------------
function setLanguage(lang) {
  currentLang = lang;
  updateUI();
  scheduleSave();
}

function toggleLanguage() {
  setLanguage(currentLang === "hu" ? "en" : "hu");
}

// ---------------------------------------------------------------------------
// Theme switching
// ---------------------------------------------------------------------------
function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle("dark-mode", theme === "dark");
  // Update icon: ☀ for dark mode (click to go light), ☾ for light mode (click to go dark)
  const icon = document.querySelector("#theme-toggle .theme-icon");
  if (icon) icon.innerHTML = theme === "dark" ? "&#9788;" : "&#9790;";
}

function toggleTheme() {
  applyTheme(currentTheme === "light" ? "dark" : "light");
  scheduleSave();
}

// ---------------------------------------------------------------------------
// Sidebar toggle (collapse / expand)
// ---------------------------------------------------------------------------
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  applySidebarState();
  scheduleSave();
}

function applySidebarState() {
  const sidebar = document.getElementById("results-container");
  const btn = document.getElementById("sidebar-toggle");
  if (!sidebar || !btn) return;
  sidebar.classList.toggle("sidebar-collapsed", !sidebarOpen);
  btn.setAttribute("aria-expanded", String(sidebarOpen));
  // Also toggle a class on the layout wrapper so .app-main can expand
  const layout = sidebar.closest(".app-layout");
  if (layout) layout.classList.toggle("sidebar-is-collapsed", !sidebarOpen);
}

// ---------------------------------------------------------------------------
// SPA View Routing
// ---------------------------------------------------------------------------
function switchView(viewId) {
  document.querySelectorAll(".app-view").forEach((v) => {
    v.classList.toggle("active", v.id === viewId);
  });
  // Update nav link active states
  document.querySelectorAll(".nav-link[data-view]").forEach((link) => {
    link.classList.toggle("nav-link--active", link.dataset.view === viewId);
  });
  // Re-generate dynamic views on switch
  if (viewId === "view-calendar") generateCalendarView();
  if (viewId === "view-whatif") generateWhatIfView();
}

// ---------------------------------------------------------------------------
// Calendar / Timeline View
// ---------------------------------------------------------------------------

/**
 * Gather all assessments with valid dates across all semesters,
 * flatten them, sort chronologically, and render into #view-calendar.
 */
function generateCalendarView() {
  const container = document.getElementById("view-calendar");
  if (!container) return;

  const semesters = getSemesters();
  const items = [];

  // Only show assessments from the newest semester (index 0, highest number)
  const newest = semesters[0];
  if (newest) {
    (newest.subjects || []).forEach((subj) => {
      (subj.assessments || []).forEach((a) => {
        if (!a.date) return;
        items.push({
          date: a.date,
          assessmentName: a.name,
          subjectName: subj.name || t("subjectName"),
          maxPoints: Number(a.maxPoints) || 0,
          achievedPoints: a.achievedPoints != null && a.achievedPoints !== "" ? Number(a.achievedPoints) : null,
          semesterNumber: newest.number,
        });
      });
    });
  }

  // Sort chronologically
  items.sort((a, b) => a.date.localeCompare(b.date));

  if (items.length === 0) {
    container.innerHTML = `
      <div class="calendar-wrapper">
        <h2 class="calendar-title">${t("calendarTitle")}</h2>
        <p class="no-data">${t("calendarNoAssessments")}</p>
      </div>`;
    return;
  }

  // Group by month (YYYY-MM)
  const groups = new Map();
  items.forEach((item) => {
    const key = item.date.slice(0, 7); // "YYYY-MM"
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthFormatter = new Intl.DateTimeFormat(currentLang === "hu" ? "hu-HU" : "en-US", {
    year: "numeric",
    month: "long",
  });

  const dayFormatter = new Intl.DateTimeFormat(currentLang === "hu" ? "hu-HU" : "en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });

  let html = `<div class="calendar-wrapper">
    <h2 class="calendar-title">${t("calendarTitle")}</h2>
    <div class="calendar-timeline">`;

  for (const [monthKey, monthItems] of groups) {
    const monthDate = new Date(monthKey + "-01");
    const monthLabel = monthFormatter.format(monthDate);

    html += `<div class="cal-month-group">
      <div class="cal-month-label">${monthLabel}</div>
      <div class="cal-month-items">`;

    monthItems.forEach((item) => {
      const d = new Date(item.date + "T00:00:00");
      const isPast = d < today;
      const isCompleted = item.achievedPoints != null;
      let statusClass = "cal-upcoming";
      let statusLabel = t("calendarUpcoming");
      if (isCompleted) {
        statusClass = "cal-completed";
        statusLabel = t("calendarCompleted");
      } else if (isPast) {
        statusClass = "cal-past";
        statusLabel = t("calendarPast");
      }

      const dayLabel = dayFormatter.format(d);
      const pctText = isCompleted && item.maxPoints > 0
        ? ` (${((item.achievedPoints / item.maxPoints) * 100).toFixed(1)}%)`
        : "";
      const pointsText = isCompleted
        ? `${item.achievedPoints}/${item.maxPoints} ${t("calendarPoints")}${pctText}`
        : `${item.maxPoints} ${t("calendarPoints")}`;

      html += `
        <div class="cal-item ${statusClass}">
          <div class="cal-item-dot"></div>
          <div class="cal-item-date">${dayLabel}</div>
          <div class="cal-item-body">
            <div class="cal-item-subject">${escapeHTML(item.subjectName)}</div>
            <div class="cal-item-name">${escapeHTML(item.assessmentName)}</div>
            <div class="cal-item-meta">
              <span class="cal-item-points">${pointsText}</span>
              <span class="cal-item-status">${statusLabel}</span>
            </div>
          </div>
        </div>`;
    });

    html += `</div></div>`;
  }

  html += `</div></div>`;
  container.innerHTML = html;
}

// ---------------------------------------------------------------------------
// What-If Target Calculator View
// ---------------------------------------------------------------------------
function generateWhatIfView() {
  const container = document.getElementById("view-whatif");
  if (!container) return;

  const semesters = getSemesters();

  // Build semester options
  const semOpts = semesters.map((sem, i) =>
    `<option value="${i}">${sem.number}. ${t("semesterNumber")}</option>`
  ).join("");

  // Metric options for Level 1
  const metrics = [
    { key: "weightedAverage", label: t("metricWeightedAvg") },
    { key: "creditIndex", label: t("metricCreditIndex") },
    { key: "correctedCreditIndex", label: t("metricCorrectedCreditIndex") },
    { key: "scholarshipGPA", label: t("metricScholarshipGPA") },
  ];
  const metricOpts = metrics.map(m =>
    `<option value="${m.key}">${m.label}</option>`
  ).join("");

  container.innerHTML = `
    <div class="whatif-wrapper">
      <h2 class="whatif-title">${t("whatIfTitle")}</h2>

      <div class="whatif-tabs">
        <button class="whatif-tab whatif-tab--active" data-whatif-tab="semester">${t("whatIfTabSemester")}</button>
        <button class="whatif-tab" data-whatif-tab="subject">${t("whatIfTabSubject")}</button>
      </div>

      <!-- Level 1: Semester Average Target -->
      <div class="whatif-panel whatif-panel--semester whatif-panel--active" data-whatif-panel="semester">
        <div class="whatif-form">
          <div class="whatif-field">
            <label>${t("whatIfSelectSemester")}</label>
            <select id="whatif-sem-select">${semOpts}</select>
          </div>
          <div class="whatif-field">
            <label>${t("whatIfSelectMetric")}</label>
            <select id="whatif-metric-select">${metricOpts}</select>
          </div>
          <div class="whatif-field">
            <label>${t("whatIfTargetAvg")}</label>
            <input id="whatif-target-avg" type="number" step="0.01" min="1" max="5" value="4.00" />
          </div>
          <button class="btn btn-primary" id="whatif-calc-semester">${t("whatIfCalculate")}</button>
        </div>
        <div id="whatif-result-semester" class="whatif-result"></div>
      </div>

      <!-- Level 2: Subject Points Target -->
      <div class="whatif-panel whatif-panel--subject" data-whatif-panel="subject">
        <div class="whatif-form">
          <div class="whatif-field">
            <label>${t("whatIfSelectSemester")}</label>
            <select id="whatif-subj-sem-select">${semOpts}</select>
          </div>
          <div class="whatif-field">
            <label>${t("whatIfSelectSubject")}</label>
            <select id="whatif-subj-select"><option value="">—</option></select>
          </div>
          <div class="whatif-field">
            <label>${t("whatIfTargetPct")}</label>
            <input id="whatif-target-pct" type="number" step="1" min="0" max="100" value="85" />
          </div>
          <button class="btn btn-primary" id="whatif-calc-subject">${t("whatIfCalculate")}</button>
        </div>
        <div id="whatif-result-subject" class="whatif-result"></div>
      </div>
    </div>
  `;

  // ----- Tab switching -----
  container.querySelectorAll(".whatif-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      container.querySelectorAll(".whatif-tab").forEach(t => t.classList.remove("whatif-tab--active"));
      container.querySelectorAll(".whatif-panel").forEach(p => p.classList.remove("whatif-panel--active"));
      tab.classList.add("whatif-tab--active");
      container.querySelector(`.whatif-panel[data-whatif-panel="${tab.dataset.whatifTab}"]`).classList.add("whatif-panel--active");
    });
  });

  // ----- Level 2: populate subjects on semester change -----
  const populateSubjects = () => {
    const semIdx = parseInt(document.getElementById("whatif-subj-sem-select").value, 10);
    const sem = semesters[semIdx];
    const sel = document.getElementById("whatif-subj-select");
    sel.innerHTML = `<option value="">—</option>`;
    if (sem) {
      sem.subjects.forEach((subj, si) => {
        const opt = document.createElement("option");
        opt.value = si;
        opt.textContent = subj.name || `${t("subjectName")} ${si + 1}`;
        sel.appendChild(opt);
      });
    }
  };
  document.getElementById("whatif-subj-sem-select").addEventListener("change", populateSubjects);
  populateSubjects();

  // ----- Level 1: Calculate semester target -----
  document.getElementById("whatif-calc-semester").addEventListener("click", () => {
    const resultDiv = document.getElementById("whatif-result-semester");
    const semIdx = parseInt(document.getElementById("whatif-sem-select").value, 10);
    const metricKey = document.getElementById("whatif-metric-select").value;
    const targetAvg = parseFloat(document.getElementById("whatif-target-avg").value);
    const sem = semesters[semIdx];
    if (!sem) return;

    const subjects = sem.subjects;
    const graded = subjects.filter(s => s.grade >= 1 && s.grade <= 5);
    const pending = subjects.filter(s => s.grade === 0 && s.credit > 0);

    if (pending.length === 0) {
      // Check if target already met
      const current = computeMetric(metricKey, subjects);
      if (current >= targetAvg) {
        resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--success">${t("whatIfResultAlreadyMet")} (${current.toFixed(2)})</div>`;
      } else {
        resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--warning">${t("whatIfNoPending")}</div>`;
      }
      return;
    }

    const pendingCredits = pending.reduce((s, sub) => s + sub.credit, 0);

    // For different metrics we solve differently
    let requiredGrade;

    if (metricKey === "weightedAverage") {
      // target = (Σ(graded credit*grade) + pendingCredits * x) / (gradedCredits + pendingCredits)
      const gradedSum = graded.reduce((s, sub) => s + sub.credit * sub.grade, 0);
      const gradedCredits = graded.reduce((s, sub) => s + sub.credit, 0);
      const totalCredits = gradedCredits + pendingCredits;
      const needed = targetAvg * totalCredits - gradedSum;
      requiredGrade = needed / pendingCredits;
    } else if (metricKey === "creditIndex") {
      // target = (Σ(graded credit*grade) + pendingCredits * x) / 30
      const gradedSum = graded.reduce((s, sub) => s + sub.credit * sub.grade, 0);
      const needed = targetAvg * 30 - gradedSum;
      requiredGrade = needed / pendingCredits;
    } else if (metricKey === "correctedCreditIndex") {
      // KKI = (Σ(credit*grade)/30) * (earned/attempted)
      // This is complex; approximate by deriving needed assuming pending grades pass
      const gradedSum = graded.reduce((s, sub) => s + sub.credit * sub.grade, 0);
      const totalCredits = subjects.reduce((s, sub) => s + sub.credit, 0);
      const earnedSoFar = graded.filter(s => s.grade >= 2).reduce((s, sub) => s + sub.credit, 0);
      // If all pending pass: earned = earnedSoFar + pendingCredits, attempted = totalCredits
      // KKI = ((gradedSum + pendingCredits*x)/30) * ((earnedSoFar + pendingCredits) / totalCredits) = target
      // Solve for x: x = (target * 30 * totalCredits / (earnedSoFar + pendingCredits) - gradedSum) / pendingCredits
      const futureEarned = earnedSoFar + pendingCredits;
      if (futureEarned === 0) { requiredGrade = Infinity; }
      else {
        const needed = (targetAvg * 30 * totalCredits / futureEarned) - gradedSum;
        requiredGrade = needed / pendingCredits;
      }
    } else if (metricKey === "scholarshipGPA") {
      // Ösztöndíjátlag = Σ(credit*grade*weight) / Σ(attempted credits)
      // weight: 1.2 for Compulsory, 1.0 for Elective
      const gradedWeightedSum = graded.reduce((s, sub) => {
        const w = sub.category === "Compulsory" ? 1.2 : 1.0;
        return s + sub.credit * sub.grade * w;
      }, 0);
      const gradedCredits = graded.reduce((s, sub) => s + sub.credit, 0);
      const totalAttempted = gradedCredits + pendingCredits;
      // For pending: target = (gradedWeightedSum + Σ(pendingCredit * x * weight)) / totalAttempted
      const pendingWeightedCredits = pending.reduce((s, sub) => {
        const w = sub.category === "Compulsory" ? 1.2 : 1.0;
        return s + sub.credit * w;
      }, 0);
      const needed = targetAvg * totalAttempted - gradedWeightedSum;
      requiredGrade = pendingWeightedCredits === 0 ? Infinity : needed / pendingWeightedCredits;
    } else {
      requiredGrade = NaN;
    }

    if (isNaN(requiredGrade)) {
      resultDiv.innerHTML = "";
      return;
    }

    if (requiredGrade <= 0) {
      resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--success">${t("whatIfResultAlreadyMet")}</div>`;
    } else if (requiredGrade > 5) {
      resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--danger">${t("whatIfResultImpossible")}</div>`;
    } else {
      const msg = t("whatIfResultSemester")
        .replace("{credits}", pendingCredits)
        .replace("{grade}", requiredGrade.toFixed(2));
      resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--info">${msg}</div>`;
    }
  });

  // ----- Level 2: Calculate subject target -----
  document.getElementById("whatif-calc-subject").addEventListener("click", () => {
    const resultDiv = document.getElementById("whatif-result-subject");
    const semIdx = parseInt(document.getElementById("whatif-subj-sem-select").value, 10);
    const subjIdx = document.getElementById("whatif-subj-select").value;
    const targetPct = parseFloat(document.getElementById("whatif-target-pct").value);
    const sem = semesters[semIdx];
    if (!sem || subjIdx === "") return;

    const subj = sem.subjects[parseInt(subjIdx, 10)];
    if (!subj) return;

    const assessments = subj.assessments || [];
    if (assessments.length === 0) {
      resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--warning">${t("whatIfNoAssessments")}</div>`;
      return;
    }

    const completed = assessments.filter(a => a.achievedPoints != null && a.achievedPoints !== "");
    const pending = assessments.filter(a => a.achievedPoints == null || a.achievedPoints === "");

    const totalMaxAll = assessments.reduce((s, a) => s + (Number(a.maxPoints) || 0), 0);
    const achievedSoFar = completed.reduce((s, a) => s + (Number(a.achievedPoints) || 0), 0);
    const pendingMax = pending.reduce((s, a) => s + (Number(a.maxPoints) || 0), 0);

    if (pending.length === 0) {
      const currentPct = totalMaxAll > 0 ? (achievedSoFar / totalMaxAll) * 100 : 0;
      if (currentPct >= targetPct) {
        resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--success">${t("whatIfSubjectAlreadyMet")} (${currentPct.toFixed(1)}%)</div>`;
      } else {
        resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--warning">${t("whatIfNoPendingAssessments")}</div>`;
      }
      return;
    }

    const neededTotal = (targetPct / 100) * totalMaxAll;
    const neededFromPending = neededTotal - achievedSoFar;

    if (neededFromPending <= 0) {
      resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--success">${t("whatIfSubjectAlreadyMet")}</div>`;
    } else if (neededFromPending > pendingMax) {
      resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--danger">${t("whatIfSubjectImpossible")}</div>`;
    } else {
      const msg = t("whatIfResultSubject")
        .replace("{maxPending}", pendingMax.toFixed(1))
        .replace("{needed}", neededFromPending.toFixed(1));
      const neededPct = pendingMax > 0 ? (neededFromPending / pendingMax * 100).toFixed(1) : 0;
      resultDiv.innerHTML = `<div class="whatif-msg whatif-msg--info">${msg} (${neededPct}%)</div>`;
    }
  });
}

/**
 * Helper: compute a given metric for a set of subjects.
 */
function computeMetric(key, subjects) {
  switch (key) {
    case "weightedAverage": return CalculationEngine.weightedAverage(subjects);
    case "creditIndex": return CalculationEngine.creditIndex(subjects);
    case "correctedCreditIndex": return CalculationEngine.correctedCreditIndex(subjects);
    case "scholarshipGPA": return CalculationEngine.scholarshipGPA(subjects);
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Update ALL translatable text without a page reload
// ---------------------------------------------------------------------------
function updateTranslatedText() {
  // Set lang attributes so CSS and a11y tools can react
  document.documentElement.lang = currentLang;
  document.body.dataset.lang = currentLang;

  // Static elements with data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = t(key);
    if (val) el.textContent = val;
  });

  // Placeholder attributes
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const val = t(key);
    if (val) el.placeholder = val;
  });

  // Language toggle label is no longer a text span
  // The slider is purely CSS-driven via data-lang attribute
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function gradeOptionsHTML(selectedGrade) {
  const grades = t("gradeOptions");
  let html = `<option value="0">${t("selectGrade")}</option>`;
  for (const [val, label] of Object.entries(grades)) {
    const sel = Number(val) === selectedGrade ? "selected" : "";
    html += `<option value="${val}" ${sel}>${label}</option>`;
  }
  return html;
}

function categoryOptionsHTML(selectedCategory) {
  return `
    <option value="Compulsory" ${selectedCategory === "Compulsory" ? "selected" : ""}>${t("compulsory")}</option>
    <option value="Elective" ${selectedCategory === "Elective" ? "selected" : ""}>${t("elective")}</option>
  `;
}

// ---------------------------------------------------------------------------
// Autocomplete helpers
// ---------------------------------------------------------------------------
const MAX_SUGGESTIONS = 12;

/**
 * Search the catalogue for courses matching a query string.
 * Returns up to MAX_SUGGESTIONS results sorted by relevance.
 */
function searchCourses(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  const results = courseCatalogue.filter((c) =>
    c.name.toLowerCase().includes(q)
  );
  // Prefer starts-with matches first
  results.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return aStarts - bStarts || a.name.localeCompare(b.name);
  });
  return results.slice(0, MAX_SUGGESTIONS);
}

/**
 * Attach an autocomplete dropdown to a name input element.
 * When a course is selected, fires `onSelect(course)`.
 * When the user types freely (no selection), fires `onFreeType(value)`.
 */
function attachAutocomplete(inputEl, onSelect, onFreeType) {
  // Create dropdown container – appended to body so it escapes overflow:hidden parents
  const dropdown = document.createElement("div");
  dropdown.className = "autocomplete-dropdown";
  document.body.appendChild(dropdown);

  let activeIndex = -1;
  let currentResults = [];
  let justSelected = false;

  /** Position the dropdown directly below the input using fixed coords */
  function positionDropdown() {
    const rect = inputEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${Math.max(rect.width, 280)}px`;
  }

  function showDropdown(results) {
    currentResults = results;
    activeIndex = -1;
    if (results.length === 0) {
      dropdown.innerHTML = "";
      dropdown.classList.remove("visible");
      return;
    }
    dropdown.innerHTML = results
      .map(
        (c, i) =>
          `<div class="autocomplete-item" data-index="${i}">
            <span class="ac-name">${highlightMatch(c.name, inputEl.value)}</span>
            <span class="ac-credit">${c.credit} kr</span>
          </div>`
      )
      .join("");
    positionDropdown();
    dropdown.classList.add("visible");

    // Click on item
    dropdown.querySelectorAll(".autocomplete-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus on input
        const idx = Number(item.dataset.index);
        selectItem(idx);
      });
    });
  }

  function hideDropdown() {
    dropdown.innerHTML = "";
    dropdown.classList.remove("visible");
    currentResults = [];
    activeIndex = -1;
  }

  function selectItem(index) {
    const course = currentResults[index];
    if (!course) return;
    justSelected = true;
    inputEl.value = course.name;
    hideDropdown();
    onSelect(course);
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHTML(text);
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHTML(text);
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return `${escapeHTML(before)}<mark>${escapeHTML(match)}</mark>${escapeHTML(after)}`;
  }

  // Events
  inputEl.addEventListener("input", () => {
    if (justSelected) {
      justSelected = false;
      return;
    }
    const val = inputEl.value.trim();
    if (val.length >= 1) {
      showDropdown(searchCourses(val));
    } else {
      hideDropdown();
    }
    onFreeType(val);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (!dropdown.classList.contains("visible")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
      updateActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectItem(activeIndex);
    } else if (e.key === "Escape") {
      hideDropdown();
    }
  });

  inputEl.addEventListener("blur", () => {
    // Small delay so click on dropdown item can fire first
    setTimeout(hideDropdown, 150);
  });

  inputEl.addEventListener("focus", () => {
    const val = inputEl.value.trim();
    if (val.length >= 1) {
      showDropdown(searchCourses(val));
    }
  });

  // Reposition on scroll / resize so the dropdown tracks the input
  const reposition = () => {
    if (dropdown.classList.contains("visible")) positionDropdown();
  };
  window.addEventListener("scroll", reposition, true); // capture phase for inner scrolls
  window.addEventListener("resize", reposition);

  // Cleanup helper – called when the row is removed from DOM
  inputEl._acCleanup = () => {
    window.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
    dropdown.remove();
  };

  function updateActive() {
    dropdown.querySelectorAll(".autocomplete-item").forEach((item, i) => {
      item.classList.toggle("active", i === activeIndex);
    });
  }
}

// ---------------------------------------------------------------------------
// Assessment percentage helpers
// ---------------------------------------------------------------------------

/** Current % – only assessments where achievedPoints is entered */
function assessmentCurrentPct(assessments) {
  if (!assessments || assessments.length === 0) return null;
  let sumAchieved = 0;
  let sumMax = 0;
  for (const a of assessments) {
    if (a.achievedPoints != null && a.maxPoints > 0) {
      sumAchieved += a.achievedPoints;
      sumMax += a.maxPoints;
    }
  }
  if (sumMax === 0) return null;
  return (sumAchieved / sumMax) * 100;
}

/** Cumulative % – all assessments (including future/ungraded ones) */
function assessmentCumulativePct(assessments) {
  if (!assessments || assessments.length === 0) return null;
  let sumAchieved = 0;
  let sumMax = 0;
  for (const a of assessments) {
    if (a.maxPoints > 0) {
      sumMax += a.maxPoints;
      if (a.achievedPoints != null) sumAchieved += a.achievedPoints;
    }
  }
  if (sumMax === 0) return null;
  return (sumAchieved / sumMax) * 100;
}

// ---------------------------------------------------------------------------
// Render a single subject row
// ---------------------------------------------------------------------------
function renderSubjectRow(semIdx, subject) {
  const row = document.createElement("tr");
  row.className = "subject-row";
  row.dataset.subjectId = subject.id;

  // Assessment percentages – always visible
  const assessments = subject.assessments || [];
  const curPct = assessmentCurrentPct(assessments);
  const cumPct = assessmentCumulativePct(assessments);
  const pctBadge = `<div class="assessment-pct-badges">
      <span class="pct-badge pct-current" title="${t('assessmentCurrentPct')}" data-tooltip-key="descCurrentPct">${curPct != null ? curPct.toFixed(1) + '%' : 'N/A'}</span>
      <span class="pct-badge pct-cumulative" title="${t('assessmentCumulativePct')}" data-tooltip-key="descCumulativePct">${cumPct != null ? cumPct.toFixed(1) + '%' : 'N/A'}</span>
    </div>`;

  row.innerHTML = `
    <td class="td-name" colspan="5">
      <div class="subject-expandable">
        <div class="subject-main-row">
          <button class="btn-expand" aria-expanded="false" aria-label="Expand">&#9654;</button>
          <div class="name-cell">
            <input type="text" class="input-name" value="${escapeHTML(subject.name)}"
                   placeholder="${t("subjectName")}"
                   autocomplete="off" />
          </div>
          ${pctBadge}
          <select class="input-grade">${gradeOptionsHTML(subject.grade)}</select>
          <button class="btn btn-danger btn-remove-subject btn-remove-subject--inline" title="${t("removeSubject")}">✕</button>
        </div>
        <div class="assessment-panel" hidden>
          <div class="panel-fields">
            <label class="panel-field">
              <span class="panel-field-label">${t('credit')}</span>
              <input type="number" class="input-credit" value="${subject.credit}" min="0" max="30" placeholder="${t('credit')}" />
            </label>
            <label class="panel-field">
              <span class="panel-field-label">${t('category')}</span>
              <select class="input-category">${categoryOptionsHTML(subject.category)}</select>
            </label>
          </div>
          <div class="assessment-list"></div>
          <div class="assessment-form">
            <input type="text" class="assess-name" placeholder="${t('assessmentName')}" />
            <input type="date" class="assess-date" />
            <input type="number" class="assess-max" placeholder="${t('assessmentMaxPts')}" min="0" />
            <input type="number" class="assess-achieved" placeholder="${t('assessmentAchievedPts')}" min="0" />
            <button class="btn btn-primary btn-add-assessment">${t('addAssessment')}</button>
          </div>
          <div class="panel-delete-area">
            <button class="btn btn-danger btn-remove-subject btn-remove-subject--panel">${t('removeSubject')}</button>
          </div>
        </div>
      </div>
    </td>
  `;

  // ---- Expand / collapse ----
  const expandBtn = row.querySelector(".btn-expand");
  const panel = row.querySelector(".assessment-panel");
  expandBtn.addEventListener("click", () => {
    const isOpen = panel.hidden;
    panel.hidden = !isOpen;
    expandBtn.setAttribute("aria-expanded", String(isOpen));
    expandBtn.classList.toggle("open", isOpen);
    if (isOpen) renderAssessmentList(semIdx, subject, row);
  });

  // ---- Pct badge click tooltips ----
  row.querySelectorAll(".pct-badge").forEach((badge) => {
    badge.style.cursor = "pointer";
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      // Remove any existing tooltip
      document.querySelectorAll(".pct-tooltip").forEach((el) => el.remove());
      const key = badge.dataset.tooltipKey;
      const text = t(key);
      const tip = document.createElement("div");
      tip.className = "pct-tooltip";
      tip.innerHTML = `<div class="pct-tooltip-text">${text}</div>`;
      document.body.appendChild(tip);
      // Position fixed relative to badge
      const rect = badge.getBoundingClientRect();
      tip.style.left = rect.left + rect.width / 2 + "px";
      tip.style.top = rect.top - tip.offsetHeight - 8 + "px";
      // Close on click outside
      const close = (ev) => {
        if (!tip.contains(ev.target) && ev.target !== badge) {
          tip.remove();
          document.removeEventListener("click", close, true);
        }
      };
      setTimeout(() => document.addEventListener("click", close, true), 0);
    });
  });

  // ---- generic field update helper ----
  const update = (field, rawValue) => {
    updateSubject(semIdx, subject.id, { [field]: rawValue });
    renderResults();
    scheduleSave();
  };

  // ---- Autocomplete on name input ----
  const nameInput = row.querySelector(".input-name");

  attachAutocomplete(
    nameInput,
    // onSelect – Smart Fill: auto-fill credit + store hidden metadata
    (course) => {
      // Remember if assessment panel was open before re-render
      const panel = row.querySelector(".assessment-panel");
      const wasOpen = panel && !panel.hidden;

      updateSubject(semIdx, subject.id, {
        name: course.name,
        credit: course.credit,
        responsible: course.responsible,
        language: course.language,
        url: course.link,
      });
      // Re-render this semester to reflect the filled credit
      renderSemesters();
      renderResults();
      scheduleSave();

      // Restore panel open state
      if (wasOpen) {
        const newRow = document.querySelector(`tr.subject-row[data-subject-id="${subject.id}"]`);
        if (newRow) {
          const expandBtn = newRow.querySelector(".btn-expand");
          if (expandBtn) expandBtn.click();
        }
      }
    },
    // onFreeType – user is typing manually; clear metadata, just update name
    (value) => {
      update("name", value);
    }
  );

  // ---- other field listeners ----
  row.querySelector(".input-credit").addEventListener("input", (e) => update("credit", e.target.value));
  row.querySelector(".input-grade").addEventListener("change", (e) => update("grade", e.target.value));
  row.querySelector(".input-category").addEventListener("change", (e) => update("category", e.target.value));

  row.querySelectorAll(".btn-remove-subject").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await showConfirm(t("confirmRemoveSubject"))) return;
      removeSubjectFromSemester(semIdx, subject.id);
      renderSemesters();
      renderResults();
      scheduleSave();
    });
  });

  // ---- Add assessment ----
  row.querySelector(".btn-add-assessment").addEventListener("click", () => {
    const nameEl = row.querySelector(".assess-name");
    const dateEl = row.querySelector(".assess-date");
    const maxEl = row.querySelector(".assess-max");
    const achievedEl = row.querySelector(".assess-achieved");
    const aName = nameEl.value.trim();
    if (!aName) { nameEl.focus(); return; }
    addAssessment(semIdx, subject.id, {
      name: aName,
      date: dateEl.value,
      maxPoints: maxEl.value,
      achievedPoints: achievedEl.value || null,
    });
    nameEl.value = "";
    dateEl.value = "";
    maxEl.value = "";
    achievedEl.value = "";
    renderAssessmentList(semIdx, subject, row);
    refreshSubjectPctBadges(subject, row);
    scheduleSave();
  });

  return row;
}

// ---------------------------------------------------------------------------
// Render the assessment list inside an expanded subject row
// ---------------------------------------------------------------------------
function renderAssessmentList(semIdx, subject, row) {
  const listEl = row.querySelector(".assessment-list");
  const assessments = subject.assessments || [];

  if (assessments.length === 0) {
    listEl.innerHTML = `<p class="no-data">${t("noAssessments")}</p>`;
    return;
  }

  listEl.innerHTML = `
    <table class="assessment-table">
      <thead>
        <tr>
          <th>${t("assessmentName")}</th>
          <th>${t("assessmentDate")}</th>
          <th>${t("assessmentMaxPts")}</th>
          <th>${t("assessmentAchievedPts")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${assessments.map((a) => `
          <tr data-assessment-id="${a.id}">
            <td><input type="text" class="a-name" value="${escapeHTML(a.name)}" /></td>
            <td><input type="date" class="a-date" value="${a.date || ''}" /></td>
            <td><input type="number" class="a-max" value="${a.maxPoints}" min="0" /></td>
            <td><input type="number" class="a-achieved" value="${a.achievedPoints != null ? a.achievedPoints : ''}" min="0" /></td>
            <td><button class="btn btn-danger btn-remove-assessment" title="${t('removeSubject')}">✕</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;

  // Wire up inline editing and delete
  listEl.querySelectorAll("tr[data-assessment-id]").forEach((tr) => {
    const aId = Number(tr.dataset.assessmentId);

    const aUpdate = (field, raw) => {
      const updates = { [field]: raw };
      updateAssessment(semIdx, subject.id, aId, updates);
      refreshSubjectPctBadges(subject, row);
      scheduleSave();
    };

    tr.querySelector(".a-name").addEventListener("input", (e) => aUpdate("name", e.target.value));
    tr.querySelector(".a-date").addEventListener("input", (e) => aUpdate("date", e.target.value));
    tr.querySelector(".a-max").addEventListener("input", (e) => aUpdate("maxPoints", e.target.value));
    tr.querySelector(".a-achieved").addEventListener("input", (e) => aUpdate("achievedPoints", e.target.value));

    tr.querySelector(".btn-remove-assessment").addEventListener("click", () => {
      removeAssessment(semIdx, subject.id, aId);
      renderAssessmentList(semIdx, subject, row);
      refreshSubjectPctBadges(subject, row);
      scheduleSave();
    });
  });
}

/** Refresh the percentage badges on a subject row without full re-render */
function refreshSubjectPctBadges(subject, row) {
  const assessments = subject.assessments || [];
  const curPct = assessmentCurrentPct(assessments);
  const cumPct = assessmentCumulativePct(assessments);
  const existing = row.querySelector(".assessment-pct-badges");

  const html = `
    <span class="pct-badge pct-current" title="${t('assessmentCurrentPct')}">${curPct != null ? curPct.toFixed(1) + '%' : 'N/A'}</span>
    <span class="pct-badge pct-cumulative" title="${t('assessmentCumulativePct')}">${cumPct != null ? cumPct.toFixed(1) + '%' : 'N/A'}</span>
  `;

  if (existing) {
    existing.innerHTML = html;
  }
}

// ---------------------------------------------------------------------------
// Render semesters
// ---------------------------------------------------------------------------
function renderSemesters() {
  // Clean up any body-appended autocomplete dropdowns from previous render
  document.querySelectorAll(".autocomplete-dropdown").forEach((el) => el.remove());

  const container = document.getElementById("semesters-container");
  container.innerHTML = "";

  getSemesters().forEach((sem, semIdx) => {
    const section = document.createElement("section");
    section.className = "semester-card";
    section.innerHTML = `
      <div class="semester-header">
        <h2><span class="semester-toggle-icon">&#9660;</span> <span class="semester-number-text">${sem.number}. ${t("semesterNumber")}</span></h2>
        <div class="semester-header-actions">
          <button class="btn-edit-semester" title="${t("editSemester")}">&#9998;</button>
          <button class="btn btn-danger btn-remove-semester">${t("removeSemester")}</button>
        </div>
      </div>
      <div class="semester-body">
        <div class="table-wrapper">
          <table class="subject-table">
            <tbody></tbody>
          </table>
        </div>
        <button class="btn btn-primary btn-add-subject">+ ${t("addSubject")}</button>
      </div>
    `;

    const tbody = section.querySelector("tbody");
    sem.subjects.forEach((subj) => {
      tbody.appendChild(renderSubjectRow(semIdx, subj));
    });

    // Add subject
    section.querySelector(".btn-add-subject").addEventListener("click", () => {
      activeSemesterIdx = semIdx;
      const newSubj = addSubjectToSemester(semIdx);
      renderSemesters();
      renderResults();
      scheduleSave();
      // Auto-expand the newly added subject row
      const newRow = document.querySelector(`tr.subject-row[data-subject-id="${newSubj.id}"]`);
      if (newRow) {
        const expandBtn = newRow.querySelector(".btn-expand");
        if (expandBtn) expandBtn.click();
        const nameInput = newRow.querySelector(".input-name");
        if (nameInput) nameInput.focus();
      }
    });

    // Toggle semester collapse
    const header = section.querySelector(".semester-header");
    const body = section.querySelector(".semester-body");
    const toggleIcon = section.querySelector(".semester-toggle-icon");
    // Restore collapsed state if this semester was previously collapsed
    if (collapsedSemesters.has(sem.number)) {
      body.classList.add("semester-body--collapsed");
      toggleIcon.classList.add("collapsed");
    }

    // Edit semester number
    section.querySelector(".btn-edit-semester").addEventListener("click", (e) => {
      e.stopPropagation();
      const numberSpan = section.querySelector(".semester-number-text");
      const oldNumber = sem.number;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "semester-number-input";
      input.value = oldNumber;
      numberSpan.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const val = input.value.trim();
        const parsed = parseInt(val, 10);
        const newNumber = (val !== "" && !isNaN(parsed)) ? parsed : oldNumber;
        // Update collapsed tracking if number changed
        if (collapsedSemesters.has(oldNumber) && newNumber !== oldNumber) {
          collapsedSemesters.delete(oldNumber);
          collapsedSemesters.add(newNumber);
        }
        updateSemesterNumber(semIdx, newNumber);
        // Re-sort: highest number first (newest on top)
        const sems = getSemesters();
        sems.sort((a, b) => b.number - a.number);
        // Keep the edited semester active
        activeSemesterIdx = sems.findIndex(s => s.number === newNumber);
        if (activeSemesterIdx < 0) activeSemesterIdx = 0;
        renderSemesters();
        renderResults();
        scheduleSave();
      };

      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { input.removeEventListener("blur", commit); commit(); }
        if (ev.key === "Escape") { input.removeEventListener("blur", commit); renderSemesters(); }
      });
    });

    header.addEventListener("click", (e) => {
      // Don't toggle when clicking the remove button or edit button
      if (e.target.closest(".btn-remove-semester") || e.target.closest(".btn-edit-semester")) return;
      const isCollapsed = body.classList.toggle("semester-body--collapsed");
      toggleIcon.classList.toggle("collapsed", isCollapsed);
      // Track collapsed state
      if (isCollapsed) {
        collapsedSemesters.add(sem.number);
      } else {
        collapsedSemesters.delete(sem.number);
      }
      scheduleSave();
      // When expanding, make this the active semester
      if (!isCollapsed && activeSemesterIdx !== semIdx) {
        activeSemesterIdx = semIdx;
        container.querySelectorAll(".semester-card").forEach((c, i) => {
          c.classList.toggle("semester-card--active", i === semIdx);
        });
        renderResults();
      }
    });

    // Remove semester
    section.querySelector(".btn-remove-semester").addEventListener("click", async () => {
      if (!await showConfirm(t("confirmRemoveSemester"))) return;
      removeSemester(semIdx);
      // Clamp active index
      const count = getSemesters().length;
      if (activeSemesterIdx >= count) activeSemesterIdx = Math.max(0, count - 1);
      renderSemesters();
      renderResults();
      scheduleSave();
    });

    // Track which semester the user is editing
    section.addEventListener("focusin", () => {
      if (activeSemesterIdx !== semIdx) {
        activeSemesterIdx = semIdx;
        // Update active class on all cards
        container.querySelectorAll(".semester-card").forEach((c, i) => {
          c.classList.toggle("semester-card--active", i === semIdx);
        });
        renderResults();
      }
    });

    // Mark the initially active card
    if (semIdx === activeSemesterIdx) {
      section.classList.add("semester-card--active");
    }

    container.appendChild(section);
  });
}

// ---------------------------------------------------------------------------
// Render results panel – split into Current Semester + Cumulative
// ---------------------------------------------------------------------------

/** Build a grid of result-cards from a stats object */
function renderStatCards(stats, opts = {}) {
  const { showActiveSemesters } = opts;

  // Map of metric keys to their description translation keys
  const infoMap = {
    overallGPA: "descOverallGPA",
    scholarshipAvg: "descScholarshipAvg",
    creditIndex: "descCreditIndex",
    correctedCreditIndex: "descCorrectedCreditIndex",
    scholarshipGPA: "descScholarshipGPA",
  };

  function infoBtn(metricKey, label) {
    const descKey = infoMap[metricKey];
    if (!descKey) return "";
    return `<button class="btn-info" data-info-label="${escapeHTML(label)}" data-info-desc="${escapeHTML(t(descKey))}" title="Info" aria-label="Info">i</button>`;
  }

  let cards = `
    <div class="result-card">
      <div class="result-card-header">
        <span class="result-label">${t("overallGPA")}</span>
        ${infoBtn("overallGPA", t("overallGPA"))}
      </div>
      <span class="result-value">${stats.weightedAverage.toFixed(2)}</span>
    </div>
    <div class="result-card">
      <div class="result-card-header">
        <span class="result-label">${t("scholarshipAvg")}</span>
        ${infoBtn("scholarshipAvg", t("scholarshipAvg"))}
      </div>
      <span class="result-value">${stats.scholarshipAverage.toFixed(2)}</span>
    </div>
    <div class="result-card">
      <div class="result-card-header">
        <span class="result-label">${t("creditIndex")}</span>
        ${infoBtn("creditIndex", t("creditIndex"))}
      </div>
      <span class="result-value">${stats.creditIndex.toFixed(2)}</span>
    </div>
    <div class="result-card">
      <div class="result-card-header">
        <span class="result-label">${t("correctedCreditIndex")}</span>
        ${infoBtn("correctedCreditIndex", t("correctedCreditIndex"))}
      </div>
      <span class="result-value">${stats.correctedCreditIndex.toFixed(2)}</span>
    </div>
    <div class="result-card">
      <div class="result-card-header">
        <span class="result-label">${t("scholarshipGPA")}</span>
        ${infoBtn("scholarshipGPA", t("scholarshipGPA"))}
      </div>
      <span class="result-value">${stats.scholarshipGPA.toFixed(2)}</span>
    </div>
    <div class="result-card">
      <div class="result-card-header">
        <span class="result-label">${t("totalCreditsEarned")}</span>
      </div>
      <span class="result-value">${stats.creditsEarned}</span>
    </div>
    <div class="result-card">
      <div class="result-card-header">
        <span class="result-label">${t("totalCreditsAttempted")}</span>
      </div>
      <span class="result-value">${stats.creditsAttempted}</span>
    </div>`;
  if (showActiveSemesters && stats.activeSemesters != null) {
    cards += `
    <div class="result-card">
      <div class="result-card-header">
        <span class="result-label">${t("activeSemesters")}</span>
      </div>
      <span class="result-value">${stats.activeSemesters}</span>
    </div>`;
  }
  return cards;
}

function renderResults() {
  const semesters = getSemesters();
  const cumulative = CalculationEngine.cumulativeStats(semesters);
  const container = document.getElementById("results-container");

  // Current semester stats
  const currentSem = semesters[activeSemesterIdx] || null;
  const currentStats = currentSem
    ? CalculationEngine.semesterStats(currentSem)
    : null;
  const currentLabel = currentSem
    ? `${t("currentSemester")} — ${currentSem.number}. ${t("semesterNumber")}`
    : t("currentSemester");

  const isCurrent = dashboardTab === "current";

  container.innerHTML = `
    <h2>${t("resultsTitle")}</h2>

    <div class="dashboard-tabs">
      <button class="dashboard-tab${isCurrent ? " dashboard-tab--active" : ""}" data-tab="current">${currentLabel}</button>
      <button class="dashboard-tab${!isCurrent ? " dashboard-tab--active" : ""}" data-tab="cumulative">${t("cumulative")}</button>
    </div>

    <div class="dashboard-tab-content">
      ${isCurrent
        ? (currentStats
            ? `<div class="results-overview">${renderStatCards(currentStats)}</div>`
            : `<p class="no-data">${t("noSubjects")}</p>`)
        : `<div class="results-overview">${renderStatCards(cumulative, { showActiveSemesters: true })}</div>`
      }
    </div>
  `;
}



// ---------------------------------------------------------------------------
// Full UI update (language change or data change)
// ---------------------------------------------------------------------------
function updateUI() {
  renderSemesters();
  renderResults();
  updateTranslatedText();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Show a custom confirm modal that matches the Corvinus design.
 * Returns a Promise that resolves to true (OK) or false (Cancel).
 */
function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirm-modal");
    const msgEl = document.getElementById("confirm-message");
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    msgEl.textContent = message;
    okBtn.textContent = t("confirmOk");
    cancelBtn.textContent = t("confirmCancel");

    // Show with transition
    overlay.classList.add("visible");

    function cleanup(result) {
      overlay.classList.remove("visible");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }

    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onBackdrop(e) { if (e.target === overlay) cleanup(false); }
    function onKey(e) { if (e.key === "Escape") cleanup(false); }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);

    // Auto-focus cancel for safety
    cancelBtn.focus();
  });
}

/**
 * Show an info modal with a title and description.
 */
function showInfo(title, description) {
  const overlay = document.getElementById("info-modal");
  const titleEl = document.getElementById("info-title");
  const msgEl = document.getElementById("info-message");
  const closeBtn = document.getElementById("info-close");

  titleEl.textContent = title;
  msgEl.textContent = description;
  closeBtn.textContent = t("infoClose");
  overlay.classList.add("visible");

  function cleanup() {
    overlay.classList.remove("visible");
    closeBtn.removeEventListener("click", onClose);
    overlay.removeEventListener("click", onBackdrop);
    document.removeEventListener("keydown", onKey);
  }

  function onClose() { cleanup(); }
  function onBackdrop(e) { if (e.target === overlay) cleanup(); }
  function onKey(e) { if (e.key === "Escape") cleanup(); }

  closeBtn.addEventListener("click", onClose);
  overlay.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onKey);
  closeBtn.focus();
}

// ---------------------------------------------------------------------------
// PWA Install Banner
// ---------------------------------------------------------------------------
let deferredInstallPrompt = null;

function initInstallBanner() {
  const banner = document.getElementById("install-banner");
  const textEl = document.getElementById("install-banner-text");
  const actionBtn = document.getElementById("install-banner-action");
  const dismissBtn = document.getElementById("install-banner-dismiss");
  if (!banner) return;

  // Already installed / standalone → never show
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (isStandalone) return;

  // Already dismissed this session?
  if (sessionStorage.getItem("pwaInstallDismissed")) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !window.MSStream;

  if (isIOS) {
    // iOS Safari: show manual instructions
    textEl.textContent = t("installBannerIOS");
    banner.hidden = false;
  } else {
    // Android / Chrome: wait for beforeinstallprompt
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      textEl.textContent = t("installBannerAndroid");
      actionBtn.textContent = t("installBannerBtn");
      actionBtn.hidden = false;
      banner.hidden = false;
    });
  }

  // Install button click (Android)
  actionBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === "accepted") {
      banner.hidden = true;
    }
    deferredInstallPrompt = null;
  });

  // Dismiss
  dismissBtn.addEventListener("click", () => {
    banner.hidden = true;
    sessionStorage.setItem("pwaInstallDismissed", "1");
  });

  // Hide if app gets installed while banner is showing
  window.addEventListener("appinstalled", () => {
    banner.hidden = true;
    deferredInstallPrompt = null;
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
function init() {
  // Language toggle
  document.getElementById("lang-toggle").addEventListener("click", toggleLanguage);

  // Theme toggle
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

  // Sidebar toggle
  document.getElementById("sidebar-toggle").addEventListener("click", toggleSidebar);

  // Navbar link routing
  document.querySelectorAll(".nav-link[data-view]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      switchView(link.dataset.view);
      // Close mobile menu if open
      document.getElementById("nav-menu").classList.remove("open");
      document.getElementById("nav-hamburger").classList.remove("open");
      document.getElementById("nav-hamburger").setAttribute("aria-expanded", "false");
    });
  });

  // Hamburger menu toggle
  document.getElementById("nav-hamburger").addEventListener("click", () => {
    const menu = document.getElementById("nav-menu");
    const btn = document.getElementById("nav-hamburger");
    const isOpen = menu.classList.toggle("open");
    btn.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", String(isOpen));
  });

  // Add semester
  document.getElementById("btn-add-semester").addEventListener("click", () => {
    addSemester();
    activeSemesterIdx = 0; // focus newly added (top)
    renderSemesters();
    renderResults();
    scheduleSave();
  });

  // Reset all data – clear localStorage and reset in-memory
  document.getElementById("btn-reset").addEventListener("click", async () => {
    if (!await showConfirm(t("confirmResetAll"))) return;
    resetData();
    collapsedSemesters.clear();
    activeSemesterIdx = 0;
    clearState();
    renderSemesters();
    renderResults();
    scheduleSave();
  });

  // Save before the tab/window is closed
  window.addEventListener("beforeunload", saveNow);

  // Delegated click handler for info buttons and dashboard tabs
  document.getElementById("results-container").addEventListener("click", (e) => {
    // Info buttons
    const btn = e.target.closest(".btn-info");
    if (btn) {
      showInfo(btn.dataset.infoLabel, btn.dataset.infoDesc);
      return;
    }
    // Dashboard tab buttons
    const tab = e.target.closest(".dashboard-tab");
    if (tab && tab.dataset.tab) {
      dashboardTab = tab.dataset.tab;
      renderResults();
    }
  });

  // Restore saved state from localStorage
  const saved = loadState();
  if (saved) {
    if (saved.lang && Translations[saved.lang]) {
      currentLang = saved.lang;
    }
    if (saved.theme === "dark" || saved.theme === "light") {
      currentTheme = saved.theme;
    }
    if (saved.sidebarOpen === false) {
      sidebarOpen = false;
    }
    if (Array.isArray(saved.collapsedSemesters)) {
      collapsedSemesters = new Set(saved.collapsedSemesters);
    }
    // activeSemesterIdx defaults to 0, which is safe
  }

  // Apply theme immediately to prevent flash
  applyTheme(currentTheme);
  // Apply sidebar state
  applySidebarState();

  // Load course catalogue from courses.json, then render
  loadCourseCatalogue()
    .then((courses) => {
      courseCatalogue = courses;
      console.log(`Loaded ${courses.length} courses from courses.json`);
    })
    .catch((err) => {
      console.warn("Could not load courses.json:", err.message);
    })
    .finally(() => {
      updateUI();
      initInstallBanner();
    });
}

document.addEventListener("DOMContentLoaded", init);
