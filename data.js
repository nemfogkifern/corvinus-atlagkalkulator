/**
 * data.js
 * Data layer: subject model, semester structure, and CSV import utility.
 */

// ---------------------------------------------------------------------------
// Subject factory
// ---------------------------------------------------------------------------
let _nextId = 1;
let _nextAssessmentId = 1;

/**
 * Create a new Subject object.
 * @param {Object} opts
 * @returns {Object} subject
 */
function createSubject({
  name = "",
  credit = 0,
  grade = 0,
  category = "Compulsory",
  responsible = "",
  language = "",
  url = "",
  assessments = [],
} = {}) {
  return {
    id: _nextId++,
    name,
    credit: Number(credit) || 0,
    grade: Number(grade) || 0,
    category, // "Compulsory" | "Elective"
    responsible,
    language,
    url,
    assessments, // Array of assessment objects
  };
}

/**
 * Create a new Assessment object.
 */
function createAssessment({
  name = "",
  date = "",
  maxPoints = 0,
  achievedPoints = null,
} = {}) {
  return {
    id: _nextAssessmentId++,
    name,
    date,
    maxPoints: Number(maxPoints) || 0,
    achievedPoints: achievedPoints != null && achievedPoints !== "" ? Number(achievedPoints) : null,
  };
}

// ---------------------------------------------------------------------------
// Semester helpers
// ---------------------------------------------------------------------------

/**
 * Create a new empty semester.
 * @param {number} number – semester ordinal (1-based)
 * @returns {{ number: number, subjects: Array }}
 */
function createSemester(number) {
  return { number, subjects: [] };
}

/**
 * The main application data: an array of semesters.
 * @type {Array<{ number: number, subjects: Array }>}
 */
let semesters = [createSemester(1)];

function getSemesters() {
  return semesters;
}

function setSemesters(newSemesters) {
  semesters = newSemesters;
}

function addSemester() {
  const maxNum = semesters.length === 0 ? 0 : Math.max(...semesters.map(s => s.number));
  const newSem = createSemester(maxNum + 1);
  semesters.unshift(newSem);
  return semesters;
}

function removeSemester(index) {
  semesters.splice(index, 1);
  return semesters;
}

function updateSemesterNumber(index, newNumber) {
  if (semesters[index]) {
    semesters[index].number = newNumber;
  }
  return semesters;
}

function addSubjectToSemester(semesterIndex, subjectOpts = {}) {
  const subject = createSubject(subjectOpts);
  semesters[semesterIndex].subjects.push(subject);
  return subject;
}

function removeSubjectFromSemester(semesterIndex, subjectId) {
  const sem = semesters[semesterIndex];
  sem.subjects = sem.subjects.filter((s) => s.id !== subjectId);
}

function updateSubject(semesterIndex, subjectId, updates) {
  const sem = semesters[semesterIndex];
  const subj = sem.subjects.find((s) => s.id === subjectId);
  if (!subj) return null;
  Object.assign(subj, updates);
  if (updates.credit !== undefined) subj.credit = Number(updates.credit) || 0;
  if (updates.grade !== undefined) subj.grade = Number(updates.grade) || 0;
  return subj;
}

// ---------------------------------------------------------------------------
// Assessment CRUD
// ---------------------------------------------------------------------------

function addAssessment(semesterIndex, subjectId, opts = {}) {
  const sem = semesters[semesterIndex];
  const subj = sem.subjects.find((s) => s.id === subjectId);
  if (!subj) return null;
  if (!subj.assessments) subj.assessments = [];
  const assessment = createAssessment(opts);
  subj.assessments.push(assessment);
  return assessment;
}

function removeAssessment(semesterIndex, subjectId, assessmentId) {
  const sem = semesters[semesterIndex];
  const subj = sem.subjects.find((s) => s.id === subjectId);
  if (!subj || !subj.assessments) return;
  subj.assessments = subj.assessments.filter((a) => a.id !== assessmentId);
}

function updateAssessment(semesterIndex, subjectId, assessmentId, updates) {
  const sem = semesters[semesterIndex];
  const subj = sem.subjects.find((s) => s.id === subjectId);
  if (!subj || !subj.assessments) return null;
  const assessment = subj.assessments.find((a) => a.id === assessmentId);
  if (!assessment) return null;
  Object.assign(assessment, updates);
  if (updates.maxPoints !== undefined) assessment.maxPoints = Number(updates.maxPoints) || 0;
  if (updates.achievedPoints !== undefined) {
    assessment.achievedPoints = updates.achievedPoints != null && updates.achievedPoints !== ""
      ? Number(updates.achievedPoints)
      : null;
  }
  return assessment;
}

// ---------------------------------------------------------------------------
// Course catalogue (JSON)
// ---------------------------------------------------------------------------

/**
 * Load courses.json and return an array of course objects.
 * Each object has: { name, credit, responsible, language, link }
 * @param {string} url – path to courses.json (default: "courses.json")
 * @returns {Promise<Array<Object>>}
 */
async function loadCourseCatalogue(url = "courses.json") {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

function resetData() {
  _nextId = 1;
  _nextAssessmentId = 1;
  semesters = [];
  return semesters;
}

// ---------------------------------------------------------------------------
// LocalStorage persistence
// ---------------------------------------------------------------------------
const STORAGE_KEY = "corvinusGpaData";

/**
 * Serialize the current semesters array (and optional extras) to localStorage.
 */
function saveState(extras = {}) {
  try {
    const payload = {
      semesters,
      ...extras,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to save state to localStorage:", err.message);
  }
}

/**
 * Load state from localStorage. Returns the parsed payload or null.
 * If data exists, it restores `semesters` and recalculates `_nextId`.
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (Array.isArray(payload.semesters)) {
      semesters = payload.semesters;
      // Ensure every subject has an assessments array (backward compat)
      for (const sem of semesters) {
        for (const subj of sem.subjects) {
          if (!Array.isArray(subj.assessments)) subj.assessments = [];
        }
      }
      // Recalculate _nextId to avoid collisions with loaded subject IDs
      let maxId = 0;
      let maxAId = 0;
      for (const sem of semesters) {
        for (const subj of sem.subjects) {
          if (subj.id > maxId) maxId = subj.id;
          for (const a of subj.assessments) {
            if (a.id > maxAId) maxAId = a.id;
          }
        }
      }
      _nextId = maxId + 1;
      _nextAssessmentId = maxAId + 1;
    }
    return payload;
  } catch (err) {
    console.warn("Failed to load state from localStorage:", err.message);
    return null;
  }
}

/**
 * Remove all saved data from localStorage.
 */
function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to clear localStorage:", err.message);
  }
}

export {
  createSubject,
  createSemester,
  getSemesters,
  setSemesters,
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
};
