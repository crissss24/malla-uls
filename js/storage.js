/** Browser-only data persistence, independent from the catalogue JSON. */
const KEY = 'trama-uls-v1';
const fresh = () => ({ version: 1, approved: {}, relations: {}, customPlans: [], theme: 'light' });
export function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!parsed || parsed.version !== 1) return fresh();
    return {
      version: 1,
      approved: isRecord(parsed.approved) ? parsed.approved : {},
      relations: isRecord(parsed.relations) ? parsed.relations : {},
      customPlans: Array.isArray(parsed.customPlans) ? parsed.customPlans : [],
      theme: parsed.theme === 'dark' ? 'dark' : 'light'
    };
  } catch { return fresh(); }
}
export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function cleanImportedBackup(raw, allowedCareerIds, validPlanIds) {
  if (!isRecord(raw) || raw.version !== 1) throw new Error('Este archivo no es un respaldo compatible de trama.');
  const clean = fresh();
  const customs = Array.isArray(raw.customPlans) ? raw.customPlans : [];
  if (customs.length > 120) throw new Error('El respaldo tiene demasiados planes personalizados.');
  const allowed = new Set(allowedCareerIds);
  const ids = new Set(validPlanIds);
  for (const p of customs) {
    if (!isRecord(p) || !/^personal-[a-z\d-]{3,60}$/i.test(p.id) || !allowed.has(p.careerId) ||
        typeof p.label !== 'string' || p.label.length > 80 || !Array.isArray(p.semesters) || p.semesters.length > 20 || !p.semesters.length) {
      throw new Error('Hay un plan personalizado inválido en el respaldo.');
    }
    let seen = new Set();
    for (const sem of p.semesters) {
      if (!Array.isArray(sem) || !sem.length || sem.length > 70) throw new Error('Semestres inválidos en el respaldo.');
      for (const c of sem) {
        if (!isRecord(c) || typeof c.id !== 'string' || !/^s\d+-\d+$/.test(c.id) || seen.has(c.id) ||
            typeof c.name !== 'string' || !c.name.trim() || c.name.length > 150) throw new Error('Asignatura inválida en el respaldo.');
        seen.add(c.id);
      }
    }
    if (seen.size > 350 || ids.has(p.id)) throw new Error('Plan personalizado duplicado o demasiado extenso.');
    ids.add(p.id);
    clean.customPlans.push({
      id: p.id, careerId: p.careerId, label: p.label, year: '', quality: 'personal',
      notes: 'Malla personalizada importada.', prerequisitesVerified: false, sources: [],
      semesters: p.semesters.map(sem => sem.map(c => ({ id: c.id, name: c.name, area: 'general' })))
    });
  }
  for (const key of ['approved', 'relations']) {
    if (!isRecord(raw[key])) continue;
    for (const [planId, value] of Object.entries(raw[key])) {
      if (!ids.has(planId) || !isRecord(value) && key === 'relations') continue;
      if (key === 'approved' && Array.isArray(value)) {
        clean.approved[planId] = [...new Set(value.filter(x => typeof x === 'string' && /^s\d+-\d+$/.test(x)))].slice(0, 350);
      }
      if (key === 'relations' && isRecord(value)) {
        const obj = Object.create(null);
        for (const [courseId, reqIds] of Object.entries(value)) {
          if (!/^s\d+-\d+$/.test(courseId) || !Array.isArray(reqIds)) continue;
          obj[courseId] = [...new Set(reqIds.filter(x => typeof x === 'string' && /^s\d+-\d+$/.test(x)))].slice(0, 100);
        }
        clean.relations[planId] = obj;
      }
    }
  }
  clean.theme = raw.theme === 'dark' ? 'dark' : 'light';
  return clean;
}
export function downloadJSON(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.style.display = 'none';
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
