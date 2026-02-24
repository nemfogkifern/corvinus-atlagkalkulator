/**
 * calculationEngine.js
 * CalculationEngine – pure calculation logic for GPA / averages.
 *
 * All methods are static-like and work on arrays of subject objects.
 * Subjects with grade === 0 (not yet graded) are excluded from averages.
 */

const CalculationEngine = {
  // -----------------------------------------------------------------------
  // Filters
  // -----------------------------------------------------------------------

  /**
   * Return only subjects whose category is "Compulsory".
   * @param {Array} subjects
   * @returns {Array}
   */
  filterCompulsory(subjects) {
    return subjects.filter((s) => s.category === "Compulsory");
  },

  /**
   * Return only subjects whose category is "Elective".
   * @param {Array} subjects
   * @returns {Array}
   */
  filterElective(subjects) {
    return subjects.filter((s) => s.category === "Elective");
  },

  /**
   * Generic category filter.
   * @param {Array} subjects
   * @param {"Compulsory"|"Elective"|"All"} category
   * @returns {Array}
   */
  filterByCategory(subjects, category) {
    if (category === "All") return [...subjects];
    return subjects.filter((s) => s.category === category);
  },

  // -----------------------------------------------------------------------
  // Graded helpers (grade > 0)
  // -----------------------------------------------------------------------

  /** Return only subjects that have a grade set (1-5). */
  graded(subjects) {
    return subjects.filter((s) => s.grade >= 1 && s.grade <= 5);
  },

  /** Return only subjects that are passing (grade >= 2). */
  passed(subjects) {
    return subjects.filter((s) => s.grade >= 2 && s.grade <= 5);
  },

  // -----------------------------------------------------------------------
  // Formulas
  // -----------------------------------------------------------------------

  /**
   * Credit-weighted average (Hungarian "súlyozott átlag").
   *   Σ (grade × credit) / Σ credit
   * Only graded subjects are considered.
   * @param {Array} subjects
   * @returns {number} – 0 when there are no graded subjects.
   */
  weightedAverage(subjects) {
    const g = this.graded(subjects);
    if (g.length === 0) return 0;
    const totalWeight = g.reduce((sum, s) => sum + s.grade * s.credit, 0);
    const totalCredits = g.reduce((sum, s) => sum + s.credit, 0);
    return totalCredits === 0 ? 0 : totalWeight / totalCredits;
  },

  /**
   * Kreditindex (Credit Index).
   *   Σ (credit × grade) / 30
   * Only graded subjects (grade 1-5) contribute to the numerator.
   * The denominator is always the fixed number 30.
   * @param {Array} subjects
   * @returns {number}
   */
  creditIndex(subjects) {
    const g = this.graded(subjects);
    if (g.length === 0) return 0;
    const numerator = g.reduce((sum, s) => sum + s.credit * s.grade, 0);
    return numerator / 30;
  },

  /**
   * Korrigált kreditindex (Corrected Credit Index / KKI).
   *   (Σ (credit × grade) / 30) × (completed_credits / attempted_credits)
   * completed_credits = sum of credits where grade >= 2 (passing).
   * attempted_credits = sum of ALL credits for subjects added (even ungraded).
   * Returns 0 when attempted_credits is 0 (prevents division by zero).
   * @param {Array} subjects
   * @returns {number}
   */
  correctedCreditIndex(subjects) {
    const attempted = this.totalCredits(subjects);
    if (attempted === 0) return 0;
    const completed = this.creditsEarned(subjects);
    const g = this.graded(subjects);
    const numerator = g.reduce((sum, s) => sum + s.credit * s.grade, 0);
    return (numerator / 30) * (completed / attempted);
  },

  /**
   * Ösztöndíjátlag (Scholarship Average).
   *   Σ (credit × grade × weight) / Σ attempted_credits
   * Weight: 1.2 for "Compulsory", 1.0 for "Elective".
   * Only graded subjects (grade 1-5) contribute to the numerator.
   * The denominator is the total of all attempted (graded) credits.
   * Returns 0 when attempted_credits is 0 (prevents division by zero).
   * @param {Array} subjects
   * @returns {number}
   */
  scholarshipGPA(subjects) {
    const g = this.graded(subjects);
    if (g.length === 0) return 0;
    const numerator = g.reduce((sum, s) => {
      const weight = s.category === "Compulsory" ? 1.2 : 1.0;
      return sum + s.credit * s.grade * weight;
    }, 0);
    const attempted = g.reduce((sum, s) => sum + s.credit, 0);
    return attempted === 0 ? 0 : numerator / attempted;
  },

  /**
   * Corvinus Ösztöndíj felülvizsgálat átlag (Scholarship Review Average).
   *   Σ (credit × grade) / Σ completed_credits
   * where only passing subjects (grade >= 2) are included.
   * Failed subjects (grade === 1) are excluded from both numerator
   * and denominator. Ungraded subjects (grade === 0) are ignored.
   * Returns 0 when there are no passing subjects (prevents division by zero).
   * @param {Array} subjects
   * @returns {number}
   */
  scholarshipAverage(subjects) {
    const p = this.passed(subjects);
    if (p.length === 0) return 0;
    const numerator = p.reduce((sum, s) => sum + s.credit * s.grade, 0);
    const completedCredits = p.reduce((sum, s) => sum + s.credit, 0);
    return completedCredits === 0 ? 0 : numerator / completedCredits;
  },

  /**
   * Sum of credits for passing subjects (grade >= 2).
   * @param {Array} subjects
   * @returns {number}
   */
  creditsEarned(subjects) {
    return this.passed(subjects).reduce((sum, s) => sum + s.credit, 0);
  },

  /**
   * Sum of credits for all graded subjects (including fails).
   * @param {Array} subjects
   * @returns {number}
   */
  creditsAttempted(subjects) {
    return this.graded(subjects).reduce((sum, s) => sum + s.credit, 0);
  },

  /**
   * Total credits across all subjects (graded or not).
   * @param {Array} subjects
   * @returns {number}
   */
  totalCredits(subjects) {
    return subjects.reduce((sum, s) => sum + s.credit, 0);
  },

  // -----------------------------------------------------------------------
  // Semester-level calculations
  // -----------------------------------------------------------------------

  /**
   * Compute stats for a single semester.
   * @param {{ subjects: Array }} semester
   * @returns {Object}
   */
  semesterStats(semester) {
    const subs = semester.subjects;
    return {
      weightedAverage: this.weightedAverage(subs),
      scholarshipAverage: this.scholarshipAverage(subs),
      creditIndex: this.creditIndex(subs),
      correctedCreditIndex: this.correctedCreditIndex(subs),
      scholarshipGPA: this.scholarshipGPA(subs),
      creditsEarned: this.creditsEarned(subs),
      creditsAttempted: this.creditsAttempted(subs),
      totalCredits: this.totalCredits(subs),
    };
  },

  // -----------------------------------------------------------------------
  // Overall (cross-semester) calculations
  // -----------------------------------------------------------------------

  /**
   * Compute stats across all semesters.
   * @param {Array<{ subjects: Array }>} semesters
   * @returns {Object}
   */
  overallStats(semesters) {
    const allSubjects = semesters.flatMap((sem) => sem.subjects);
    return {
      weightedAverage: this.weightedAverage(allSubjects),
      scholarshipAverage: this.scholarshipAverage(allSubjects),
      creditIndex: this.creditIndex(allSubjects),
      correctedCreditIndex: this.correctedCreditIndex(allSubjects),
      scholarshipGPA: this.scholarshipGPA(allSubjects),
      creditsEarned: this.creditsEarned(allSubjects),
      creditsAttempted: this.creditsAttempted(allSubjects),
      totalCredits: this.totalCredits(allSubjects),
    };
  },

  // -----------------------------------------------------------------------
  // Cumulative calculations (special rules)
  // -----------------------------------------------------------------------

  /**
   * Összesített Korrigált Kreditindex (Cumulative Corrected Credit Index).
   *   (Σ (credit × grade) / (30 × numSemesters)) × (totalEarned / totalAttempted)
   * The fixed denominator 30 is multiplied by the number of active semesters.
   * Returns 0 when numSemesters is 0 or totalAttempted is 0.
   * @param {Array} allSubjects – subjects across all semesters
   * @param {number} numSemesters – count of active semesters
   * @returns {number}
   */
  cumulativeCorrectedCreditIndex(allSubjects, numSemesters) {
    if (numSemesters === 0) return 0;
    const attempted = this.totalCredits(allSubjects);
    if (attempted === 0) return 0;
    const completed = this.creditsEarned(allSubjects);
    const g = this.graded(allSubjects);
    const numerator = g.reduce((sum, s) => sum + s.credit * s.grade, 0);
    return (numerator / (30 * numSemesters)) * (completed / attempted);
  },

  /**
   * Compute cumulative stats across all semesters.
   * Uses the special cumulative KKI formula.
   * @param {Array<{ subjects: Array }>} semesters
   * @returns {Object}
   */
  cumulativeStats(semesters) {
    const allSubjects = semesters.flatMap((sem) => sem.subjects);
    const numSemesters = semesters.length;
    return {
      weightedAverage: this.weightedAverage(allSubjects),
      scholarshipAverage: this.scholarshipAverage(allSubjects),
      creditIndex: this.creditIndex(allSubjects),
      correctedCreditIndex: this.cumulativeCorrectedCreditIndex(allSubjects, numSemesters),
      scholarshipGPA: this.scholarshipGPA(allSubjects),
      creditsEarned: this.creditsEarned(allSubjects),
      creditsAttempted: this.creditsAttempted(allSubjects),
      totalCredits: this.totalCredits(allSubjects),
      activeSemesters: numSemesters,
    };
  },

  // -----------------------------------------------------------------------
  // Run arbitrary formula (extensibility hook)
  // -----------------------------------------------------------------------

  /**
   * Run any formula function with an optional category filter pre-applied.
   * @param {Function} formulaFn – receives filtered subjects array, returns number.
   * @param {Array} subjects
   * @param {"All"|"Compulsory"|"Elective"} category
   * @returns {*}
   */
  runFormula(formulaFn, subjects, category = "All") {
    const filtered = this.filterByCategory(subjects, category);
    return formulaFn.call(this, filtered);
  },
};

export default CalculationEngine;
