/** Pure, independently testable curriculum rules. No inferred institutional prerequisites. */
export const AREAS = Object.freeze({
  matematicas: { label: 'Matemáticas', color: '#5d87d5' },
  ciencias: { label: 'Ciencias', color: '#b184d4' },
  ingenieria: { label: 'Ingeniería', color: '#eea262' },
  gestion: { label: 'Gestión', color: '#65b6a2' },
  humanidades: { label: 'Humanidades', color: '#db89a7' },
  formacion: { label: 'Formación', color: '#b3a862' },
  general: { label: 'General', color: '#84979c' }
});

export const cleanText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
export function flatten(plan) {
  if (!Array.isArray(plan?.semesters)) return [];
  return plan.semesters.flatMap((semester, s) => (Array.isArray(semester) ? semester : []).map((course, i) => ({
    ...course, id: String(course.id ?? `s${s + 1}-${i + 1}`),
    name: String(course.name ?? 'Asignatura sin nombre'),
    area: AREAS[course.area] ? course.area : 'general',
    semester: s + 1
  })));
}
export function calculateProgress(courses, approvedIds) {
  const valid = new Set(courses.map(course => course.id));
  const approved = [...new Set(approvedIds)].filter(id => valid.has(id)).length;
  const total = courses.length;
  return { total, approved, pending: total - approved, percentage: total ? Math.round(approved * 100 / total) : 0 };
}
export function getPrereqs(course, userRelations = {}) {
  if (!course) return [];
  if (Object.hasOwn(userRelations, course.id)) return [...new Set(userRelations[course.id] || [])];
  return Array.isArray(course.prerequisites) ? [...new Set(course.prerequisites)] : [];
}
export function getDependents(courseId, courses, userRelations = {}) {
  return courses.filter(course => getPrereqs(course, userRelations).includes(courseId));
}
export function validateRelations(courses, relations) {
  const byId = new Map(courses.map(course => [course.id, course]));
  if (!relations || typeof relations !== 'object' || Array.isArray(relations)) return false;
  for (const [id, requiredIds] of Object.entries(relations)) {
    const course = byId.get(id);
    if (!course || !Array.isArray(requiredIds)) return false;
    if (requiredIds.some(prereq => !byId.has(prereq) || byId.get(prereq).semester >= course.semester)) return false;
  }
  return true;
}
export function filterCourses(courses, { query = '', filter = 'all', approved = [], relations = {} } = {}) {
  const approvedSet = new Set(approved);
  const needle = cleanText(query.trim());
  return courses.filter(course => {
    if (needle && !cleanText(course.name).includes(needle)) return false;
    if (filter === 'approved') return approvedSet.has(course.id);
    if (filter === 'pending') return !approvedSet.has(course.id);
    if (filter === 'with-prereqs') return getPrereqs(course, relations).length > 0;
    return true;
  });
}
export function parseCustomPlan(text, { id = 'custom-plan', careerId, label = 'Mi plan' } = {}) {
  if (typeof text !== 'string' || text.length > 45000) throw new Error('La malla es demasiado extensa.');
  const blocks = [];
  let current = [];
  const flush = () => { if (current.length) { blocks.push(current); current = []; } };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(semestre|nivel|periodo|período|año)\s*(\d+|[ivx]+)\s*[:.\-–]?$/i.test(line)) { flush(); continue; }
    if (!line) { flush(); continue; }
    if (line.length > 150) throw new Error('Cada asignatura puede tener hasta 150 caracteres.');
    current.push(line.replace(/^\s*(?:[-*•]|\d+[).])\s*/, ''));
  }
  flush();
  if (!blocks.length) throw new Error('Ingresa al menos una asignatura.');
  if (blocks.length > 20) throw new Error('Se permiten como máximo 20 semestres.');
  if (blocks.flat().length > 350) throw new Error('Se permiten como máximo 350 asignaturas.');
  return {
    id, careerId, label, year: '', quality: 'personal', prerequisitesVerified: false,
    notes: 'Malla creada localmente por la persona usuaria. No representa un documento institucional.',
    sources: [],
    semesters: blocks.map((names, semester) => names.map((name, index) => ({
      id: `s${semester + 1}-${index + 1}`, name, area: 'general'
    })))
  };
}
export function validateCustomPlan(plan, allowedCareerIds = null) {
  if (!plan || typeof plan !== 'object' || typeof plan.id !== 'string' || !/^personal-[a-z\d-]{3,60}$/i.test(plan.id)) return false;
  if (typeof plan.careerId !== 'string' || (allowedCareerIds && !allowedCareerIds.includes(plan.careerId))) return false;
  if (typeof plan.label !== 'string' || plan.label.length > 80 || !Array.isArray(plan.semesters) || plan.semesters.length < 1 || plan.semesters.length > 20) return false;
  let total = 0;
  const used = new Set();
  for (const semester of plan.semesters) {
    if (!Array.isArray(semester) || !semester.length || semester.length > 70) return false;
    for (const c of semester) {
      if (typeof c?.id !== 'string' || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 150 || used.has(c.id)) return false;
      used.add(c.id); total++;
    }
  }
  return total <= 350;
}
