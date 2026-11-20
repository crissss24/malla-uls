import { AREAS, cleanText, escapeHTML as h, flatten, calculateProgress, getPrereqs, getDependents, filterCourses, parseCustomPlan, validateCustomPlan } from './logic.js';
import { loadState, saveState, cleanImportedBackup, downloadJSON } from './storage.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let catalog = null;
let state = loadState();
let activeCareer = null;
let activePlan = null;
let activeMeta = null;
let courses = [];
let filter = 'all';
let selectedCourseId = null;
let editingPrereqId = null;
let selectionToken = 0;
let toastTimer;
const planCache = new Map();

function announce(message) {
  const el = $('#toast');
  el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3700);
}
function persist() { if (!saveState(state)) announce('No se pudo guardar el avance; revisa el almacenamiento del navegador.'); }
function approved() { return Array.isArray(state.approved[activePlan?.id]) ? state.approved[activePlan.id] : []; }
function relations() { return state.relations[activePlan?.id] || {}; }
function allPlanMetas(careerId) {
  const fixed = catalog.plans.filter(p => p.careerId === careerId);
  const custom = state.customPlans.filter(p => p.careerId === careerId).map(p => ({ id: p.id, careerId: p.careerId, label: p.label, year: '', quality: 'personal', semesters: p.semesters.length, subjects: flatten(p).length, personal: true }));
  return [...fixed, ...custom];
}
function updateURL() {
  const url = new URL(window.location.href);
  if (activeCareer) url.searchParams.set('c', activeCareer.id);
  if (activePlan) url.searchParams.set('p', activePlan.id); else url.searchParams.delete('p');
  history.replaceState(null, '', url);
}
function theme() {
  document.documentElement.dataset.theme = state.theme;
  $('#themeBtn').textContent = state.theme === 'dark' ? '☀' : '☾';
  $('#themeBtn').title = state.theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro';
}
function closeMobile() { $('#sidebar').classList.remove('is-open'); $('#mobileShade').hidden = true; }
function openMobile() { $('#sidebar').classList.add('is-open'); $('#mobileShade').hidden = false; }
function closeDetail() {
  $('#detailPanel').hidden = true; $('#detailShade').hidden = true;
  selectedCourseId = null;
  $$('.course-card.is-selected,.course-card.is-linked,.course-card.is-muted').forEach(e => e.classList.remove('is-selected','is-linked','is-muted'));
  drawRelations();
}
function renderCatalog() {
  const search = cleanText($('#careerSearch').value.trim());
  const faculty = $('#facultySelect').value;
  const careers = catalog.careers.filter(c => (faculty === 'all' || c.faculty === faculty) && (!search || cleanText(c.name).includes(search) || cleanText(c.code).includes(search)));
  const current = careers.filter(c => !c.archived).length;
  const archive = careers.length - current;
  $('#catalogCount').textContent = `${current} carrera${current !== 1 ? 's' : ''}${archive ? ` + ${archive} histórica${archive !== 1 ? 's' : ''}` : ''} · ${catalog.plans.length} planes`; 
  let currentFaculty = null;
  $('#careerList').innerHTML = careers.map(c => {
    const heading = c.faculty !== currentFaculty ? `<div class="faculty-heading">${h(c.faculty)}</div>` : '';
    currentFaculty = c.faculty;
    const n = allPlanMetas(c.id).length;
    const icon = /Ingenier|Minas|Construcci|Arquitectura/.test(c.name) ? '⌁' : /Pedagog|Educaci/.test(c.name) ? '✎' : /Derecho|Periodismo|Traducci/.test(c.name) ? '◇' : /Biotecn|Enfermer|Kinesiol|Farmacia/.test(c.name) ? '✺' : '✳';
    return `${heading}<button type="button" class="career-btn ${activeCareer?.id === c.id ? 'is-current' : ''}" data-career="${h(c.id)}" aria-pressed="${activeCareer?.id === c.id}"><span class="career-icon">${icon}</span><span class="career-name">${h(c.name)}${c.archived ? ' <small>(histórica)</small>' : ''}</span><span class="career-bubble ${!n ? 'empty' : ''}" title="${n} versiones disponibles">${n || '—'}</span></button>`;
  }).join('') || '<p class="semester-empty">No encontramos carreras con ese filtro.</p>';
}
function renderHero() {
  $('#careerTitle').textContent = activeCareer?.name || 'Explora las mallas ULS';
  $('#careerDescription').textContent = activeCareer ? (activePlan ? `${activeMeta?.label || ''} · ${courses.length} asignaturas recopiladas en ${activePlan.semesters.length} semestres.` : 'Todavía no hay asignaturas transcritas para esta carrera. Puedes agregar una malla propia.') : 'Selecciona una carrera para comenzar.';
  $('#careerFaculty').textContent = `Facultad de ${activeCareer?.faculty || 'La Serena'}`;
  $('#careerCode').textContent = activeCareer?.code ? `Código ${activeCareer.code}` : '';
}
function renderPlanSelect() {
  const plans = allPlanMetas(activeCareer.id);
  const select = $('#planSelect');
  select.innerHTML = plans.length ? plans.map(p => `<option value="${h(p.id)}">${h(p.year ? `${p.year} · ${p.label}` : p.label)}${p.quality === 'parcial' ? ' (incompleta)' : ''}${p.personal ? ' ✦' : ''}</option>`).join('') : '<option value="">Sin mallas disponibles</option>';
  select.disabled = !plans.length;
  if (activePlan) select.value = activePlan.id;
}
function renderSource() {
  const banner = $('#sourceBanner');
  if (!activePlan) {
    banner.className = 'source-banner info';
    banner.innerHTML = '<div><strong>Esta carrera está en el catálogo, pero aún no tiene una malla transcrita.</strong><p>Evita guiarte por semestres inventados. Puedes aportar tu plan personal o consultar el sitio oficial.</p></div><div class="source-links"><a href="https://userena.cl/carreras" target="_blank" rel="noopener noreferrer">Ver ULS ↗</a></div>';
    return;
  }
  const quality = activePlan.quality;
  const personal = quality === 'personal';
  const partial = quality === 'parcial';
  banner.className = `source-banner ${personal ? 'info' : ''}`;
  banner.innerHTML = `<div><strong>${personal ? 'Malla personal · guardada en este navegador' : partial ? 'Malla parcialmente transcrita · quedan semestres por completar' : 'Malla referencial · contrasta con la versión oficial de tu cohorte'}</strong><p>${h(activePlan.notes || 'Las asignaturas fueron recopiladas desde publicaciones disponibles públicamente. No se han confirmado requisitos ni créditos.')}${personal ? '' : ' No se han cargado prerrequisitos oficiales.'}</p></div><div class="source-links">${(activePlan.sources || []).filter(s => /^https:\/\//.test(s.url)).map((s, i) => `<a href="${h(s.url)}" target="_blank" rel="noopener noreferrer" title="${h(s.label)}">Fuente ${i+1} ↗</a>`).join('')}${personal ? '' : '<a href="https://userena.cl/carreras" target="_blank" rel="noopener noreferrer">ULS ↗</a>'}</div>`;
}
function renderStats() {
  const p = calculateProgress(courses, approved());
  const semesters = activePlan?.semesters.length || 0;
  const hasManual = Object.values(relations()).filter(Array.isArray).reduce((count, a) => count + a.length, 0);
  $('#stats').innerHTML = `<div class="stat-card stat-progress"><div><div class="stat-label">AVANCE TOTAL</div><div class="stat-value">${p.percentage}<span>%</span></div><div class="stat-foot">${p.total ? 'de tu malla actual' : 'Selecciona una versión'}</div></div><div class="mini-donut" style="--progress:${p.percentage}"><span>${p.percentage}%</span></div></div><div class="stat-card"><div class="stat-label">ASIGNATURAS APROBADAS</div><div class="stat-value">${p.approved}<span> / ${p.total}</span></div><div class="stat-foot">Marcadas por ti</div></div><div class="stat-card"><div class="stat-label">ASIGNATURAS PENDIENTES</div><div class="stat-value">${p.pending}</div><div class="stat-foot">Por completar</div></div><div class="stat-card"><div class="stat-label">SEMESTRES · RELACIONES</div><div class="stat-value">${semesters}<span> · ${hasManual}</span></div><div class="stat-foot">Prerrequisitos añadidos por ti</div></div>`;
}
function renderBoard() {
  const board = $('#board');
  if (!activePlan) {
    board.innerHTML = '<div class="empty-state"><div class="empty-illustration">✳</div><h3>Un espacio para tu malla.</h3><p>Todavía no encontramos una transcripción pública suficientemente detallada de esta carrera. Puedes crear tu versión local, semestre a semestre.</p><div class="empty-actions"><button type="button" class="btn btn-primary" data-action="custom">+ Agregar mi malla</button><a class="btn btn-outline" href="https://userena.cl/carreras" target="_blank" rel="noopener noreferrer">Consultar oferta ULS ↗</a></div></div>';
    $('#boardFooter').innerHTML = '';
    $('#boardSubtitle').textContent = 'Sin datos curriculares transcritos para esta carrera.';
    return;
  }
  const done = new Set(approved());
  const rel = relations();
  const visible = new Set(filterCourses(courses, { query: $('#subjectSearch').value, filter, approved: [...done], relations: rel }).map(x => x.id));
  const countShown = visible.size;
  board.innerHTML = activePlan.semesters.map((semester, index) => {
    const semesterCourses = courses.filter(c => c.semester === index+1);
    const semesterDone = semesterCourses.filter(c => done.has(c.id)).length;
    const pct = semesterCourses.length ? Math.round(100*semesterDone/semesterCourses.length) : 0;
    return `<div class="semester"><div class="semester-top"><div><div class="semester-number">${index + 1}º semestre</div><div class="semester-year">Año ${Math.ceil((index+1)/2)}</div></div><div class="semester-count">${semesterDone}/${semesterCourses.length}</div></div><div class="sem-progress"><span style="width:${pct}%"></span></div><div class="course-list">${semesterCourses.map(c => {
      const isApproved = done.has(c.id);
      const isVisible = visible.has(c.id);
      const linked = getPrereqs(c, rel).length > 0;
      return `<div class="course-card ${isApproved ? 'is-approved' : ''} ${isVisible ? '' : 'is-filtered'} ${linked ? 'has-manual-prereqs' : ''}" data-course-id="${h(c.id)}" style="--area-color:${AREAS[c.area].color}"><button type="button" class="card-body" data-action="select" data-id="${h(c.id)}" title="Ver detalles de ${h(c.name)}"><span class="course-name">${h(c.name)}</span><span class="course-meta">${h(AREAS[c.area].label)}</span></button><button type="button" class="check-round" data-action="toggle" data-id="${h(c.id)}" aria-label="${isApproved ? 'Marcar como pendiente' : 'Marcar como aprobado'}: ${h(c.name)}" aria-pressed="${isApproved}">✓</button></div>`;
    }).join('') || '<p class="semester-empty">Sin ramos transcritos</p>'}</div></div>`;
  }).join('');
  $('#boardSubtitle').textContent = `${countShown} de ${courses.length} asignaturas visibles · Pulsa el círculo para aprobar un ramo; pulsa su nombre para ver conexiones.`;
  const categories = [...new Set(courses.map(c => c.area))];
  $('#boardFooter').innerHTML = `<div class="legend">${categories.map(a => `<span><i class="legend-dot" style="background:${AREAS[a].color}"></i>${h(AREAS[a].label)}</span>`).join('')}<span><i class="legend-dot" style="background:var(--green)"></i>Aprobada</span></div><div class="board-foot-note">Sin información institucional certificada de prerrequisitos</div>`;
  if (selectedCourseId && courses.some(c => c.id === selectedCourseId)) highlightSelection();
  else drawRelations();
}
function toggleCourse(id) {
  if (!activePlan || !courses.some(c => c.id === id)) return;
  const set = new Set(approved());
  if (set.has(id)) set.delete(id); else set.add(id);
  state.approved[activePlan.id] = [...set]; persist();
  renderStats(); renderBoard();
  if (selectedCourseId) renderDetail();
}
function highlightSelection() {
  const selected = courses.find(c => c.id === selectedCourseId);
  if (!selected) return;
  const rel = relations();
  const prereqs = getPrereqs(selected, rel);
  const dependents = getDependents(selected.id, courses, rel).map(c => c.id);
  const linked = new Set([...prereqs, ...dependents]);
  $$('.course-card').forEach(el => {
    const id = el.dataset.courseId;
    el.classList.toggle('is-selected', id === selected.id);
    el.classList.toggle('is-linked', linked.has(id));
    el.classList.toggle('is-muted', id !== selected.id && !linked.has(id));
  });
  drawRelations();
}
function drawRelations() {
  $('#board').querySelector('.board-lines')?.remove();
  if (!selectedCourseId) return;
  const selected = courses.find(c => c.id === selectedCourseId);
  if (!selected) return;
  const rel = relations();
  const incoming = getPrereqs(selected, rel).map(id => [id, selected.id]);
  const outgoing = getDependents(selected.id, courses, rel).map(c => [selected.id, c.id]);
  const pairs = [...incoming, ...outgoing];
  if (!pairs.length) return;
  const board = $('#board');
  const rect = board.getBoundingClientRect();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns,'svg');
  svg.setAttribute('class','board-lines'); svg.setAttribute('width',String(board.scrollWidth)); svg.setAttribute('height',String(board.scrollHeight));
  svg.setAttribute('viewBox',`0 0 ${board.scrollWidth} ${board.scrollHeight}`);
  const getCard = id => [...board.querySelectorAll('.course-card')].find(el => el.dataset.courseId === id && !el.classList.contains('is-filtered'));
  for (const [from, to] of pairs) {
    const start = getCard(from), end = getCard(to); if (!start || !end) continue;
    const a = start.getBoundingClientRect(), b = end.getBoundingClientRect();
    const x1 = a.right - rect.left - 2, y1 = a.top + a.height/2 - rect.top;
    const x2 = b.left - rect.left + 2, y2 = b.top + b.height/2 - rect.top;
    const line = document.createElementNS(ns,'path');
    const bend = Math.max(16, Math.abs(x2-x1)/2);
    line.setAttribute('d',`M ${x1} ${y1} C ${x1+bend} ${y1}, ${x2-bend} ${y2}, ${x2} ${y2}`);
    line.setAttribute('stroke','#5bad91');line.setAttribute('stroke-width','2');line.setAttribute('stroke-opacity','.9');
    svg.append(line);
  }
  board.prepend(svg);
}
function showDetail(id) {
  if (!courses.some(c => c.id === id)) return;
  selectedCourseId = id;
  $('#detailPanel').hidden = false; $('#detailShade').hidden = false;
  renderDetail(); highlightSelection();
}
function renderDetail() {
  const c = courses.find(c => c.id === selectedCourseId); if (!c) return;
  const done = new Set(approved());
  const rel = relations();
  const before = getPrereqs(c, rel).map(id => courses.find(x => x.id === id)).filter(Boolean);
  const after = getDependents(c.id,courses,rel);
  const userSet = Object.hasOwn(rel, c.id);
  const items = array => array.length ? `<div class="related-list">${array.map(x => `<button type="button" class="related-item" data-go="${h(x.id)}"><span>${h(x.name)}</span><small class="related-status">S${x.semester} · ${done.has(x.id) ? '✓' : '○'}</small>→</button>`).join('')}</div>` : '<p class="related-empty">No hay relaciones registradas para este ramo.</p>';
  $('#detailContent').innerHTML = `<div class="detail-head"><span class="section-kicker">DETALLE DE ASIGNATURA</span><button type="button" class="icon-btn" data-action="close" aria-label="Cerrar detalles">✕</button></div><div class="detail-category">${h(AREAS[c.area].label)}</div><h2>${h(c.name)}</h2><div class="detail-subtitle">${c.semester}º semestre · Año ${Math.ceil(c.semester/2)} · ${h(activeCareer.name)}</div><div class="detail-action"><button type="button" class="btn ${done.has(c.id) ? 'btn-outline' : 'btn-primary'}" data-action="toggle" data-id="${h(c.id)}">${done.has(c.id) ? '✓ Aprobado · desmarcar' : '○ Marcar como aprobado'}</button></div><p class="detail-note"><strong>Importante:</strong> ${userSet ? 'Las relaciones que ves a continuación son personalizadas y no han sido validadas por la ULS.' : 'La fuente de esta malla no permite certificar los prerrequisitos. Que aquí no aparezcan no significa que la asignatura no tenga.'}</p><div class="detail-divider"></div><h3>Prerrequisitos ${userSet ? '<span class="manual-pill">PERSONALIZADOS</span>' : ''}</h3>${items(before)}<button type="button" class="text-link" data-action="edit-prereqs" data-id="${h(c.id)}" style="margin-top:15px">✎ ${userSet ? 'Editar' : 'Agregar'} prerrequisitos ↗</button><div class="detail-divider"></div><h3>Asignaturas que dependen de esta</h3>${items(after)}<div class="detail-divider"></div><p class="related-empty">Para confirmar esta información, consulta tu resolución curricular o el plan de estudios de la Universidad de La Serena.</p>`;
}
function openPrereq(id) {
  const c = courses.find(c => c.id === id); if (!c) return;
  editingPrereqId = id;
  $('#prereqFor').textContent = `Selecciona asignaturas de semestres anteriores que sean requisito para «${c.name}». Solo se considerarán relaciones que ingreses tú.`;
  $('#prereqSearch').value = '';
  renderPrereqOptions(); $('#prereqDialog').showModal();
}
function renderPrereqOptions() {
  const c = courses.find(c => c.id === editingPrereqId); if (!c) return;
  const needle = cleanText($('#prereqSearch').value);
  const initial = new Set(getPrereqs(c,relations()));
  const existing = new Set($$('#prereqOptions input:checked').map(input=>input.value));
  // Keep checkbox selections while searching within an open modal.
  const chosen = editingChoices || (editingChoices = new Set(initial));
  $('#prereqOptions').innerHTML = courses.filter(x => x.semester < c.semester && cleanText(x.name).includes(needle)).map(x => `<label class="prereq-option"><input type="checkbox" value="${h(x.id)}" ${chosen.has(x.id) ? 'checked' : ''}/><span><strong>${h(x.name)}</strong><small>${x.semester}º semestre</small></span></label>`).join('') || '<p class="related-empty">No hay asignaturas anteriores que coincidan.</p>';
}
let editingChoices = null;
function changeCareer(id, preferredPlanId = null) {
  ++selectionToken;
  const career = catalog?.careers.find(c => c.id === id); if (!career) return;
  activeCareer = career; activePlan = null; activeMeta = null; courses = []; selectedCourseId = null;
  closeDetail(); closeMobile();
  renderCatalog();
  const metas = allPlanMetas(career.id);
  const meta = metas.find(p => p.id === preferredPlanId) || metas[0];
  if (meta) { changePlan(meta.id); } else {
    renderPlanSelect(); renderHero(); renderSource(); renderStats(); renderBoard(); updateURL();
  }
}
async function changePlan(id) {
  const token = ++selectionToken;
  const meta = allPlanMetas(activeCareer.id).find(p => p.id === id);
  if (!meta) return;
  activeMeta = meta;
  closeDetail();
  if (meta.personal) {
    activePlan = state.customPlans.find(p=>p.id === id);
  } else {
    try {
      if (!planCache.has(meta.id)) {
        const response = await fetch(`./${meta.file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        planCache.set(meta.id, await response.json());
      }
      if (token !== selectionToken) return;
      activePlan = planCache.get(meta.id);
    } catch (error) {
      if (token !== selectionToken) return;
      activePlan = null; activeMeta = null; courses = [];
      renderHero();renderPlanSelect();renderSource();renderStats();renderBoard();
      $('#sourceBanner').className='source-banner error';
      $('#sourceBanner').textContent='No fue posible cargar el plan. Comprueba la conexión y que todos los archivos JSON estén publicados.';
      console.error(error);announce('No se pudo cargar el archivo de la malla.'); return;
    }
  }
  if (!activePlan) return;
  courses = flatten(activePlan);
  $('#subjectSearch').value = '';
  filter = 'all';
  $$('[data-filter]').forEach(b => b.classList.toggle('is-active',b.dataset.filter === filter));
  renderPlanSelect();renderHero();renderSource();renderStats();renderBoard();updateURL();
}
function showCustomDialog() {
  if (!activeCareer) return;
  $('#customName').value = '';
  $('#customText').value = '';
  $('#customDialog').showModal();
}
function initializeFacultyOptions() {
  const faculties = [...new Set(catalog.careers.map(x=>x.faculty))].sort((a,b)=>a.localeCompare(b,'es'));
  $('#facultySelect').innerHTML='<option value="all">Todas las facultades</option>' + faculties.map(x=>`<option value="${h(x)}">${h(x)}</option>`).join('');
}
function listeners() {
  $('#careerSearch').addEventListener('input',renderCatalog);
  $('#facultySelect').addEventListener('change',renderCatalog);
  $('#careerList').addEventListener('click',e=>{const btn=e.target.closest('[data-career]');if(btn)changeCareer(btn.dataset.career);});
  $('#planSelect').addEventListener('change',e=>changePlan(e.target.value));
  $('#subjectSearch').addEventListener('input',renderBoard);
  $$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('is-active',x===b));renderBoard();}));
  $('#board').addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');if(!b)return;
    if(b.dataset.action==='toggle')toggleCourse(b.dataset.id);
    if(b.dataset.action==='select')showDetail(b.dataset.id);
    if(b.dataset.action==='custom')showCustomDialog();
  });
  $('#detailContent').addEventListener('click',e=>{
    const go=e.target.closest('[data-go]');if(go){showDetail(go.dataset.go);return;}
    const btn=e.target.closest('[data-action]');if(!btn)return;
    if(btn.dataset.action==='close')closeDetail();
    if(btn.dataset.action==='toggle')toggleCourse(btn.dataset.id);
    if(btn.dataset.action==='edit-prereqs'){ editingChoices=null;openPrereq(btn.dataset.id); }
  });
  $('#detailShade').addEventListener('click',closeDetail);
  $('#customPlanBtn').addEventListener('click',showCustomDialog);
  $('#customForm').addEventListener('submit',e=>{
    e.preventDefault();
    const label=$('#customName').value.trim();if(!label){announce('Escribe el nombre del plan.');return;}
    try{
      const id=`personal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
      const plan=parseCustomPlan($('#customText').value,{id,careerId:activeCareer.id,label});
      if(!validateCustomPlan(plan,catalog.careers.map(c=>c.id)))throw new Error('El formato de la malla no es válido.');
      state.customPlans.push(plan);persist();$('#customDialog').close();changeCareer(activeCareer.id,plan.id);announce(`Malla creada: ${flatten(plan).length} asignaturas.`);
    }catch(error){announce(error.message);}
  });
  $('#prereqSearch').addEventListener('input',renderPrereqOptions);
  $('#prereqOptions').addEventListener('change',e=>{if(e.target.matches('input[type=checkbox]')){if(e.target.checked)editingChoices.add(e.target.value);else editingChoices.delete(e.target.value);}});
  $('#prereqForm').addEventListener('submit',e=>{
    e.preventDefault();const c=courses.find(x=>x.id===editingPrereqId);if(!c)return;
    const valid=new Set(courses.filter(x=>x.semester<c.semester).map(x=>x.id));
    const prerequisites=[...editingChoices].filter(id=>valid.has(id));
    if(!state.relations[activePlan.id])state.relations[activePlan.id]={};
    state.relations[activePlan.id][c.id]=prerequisites;
    persist();editingChoices=null;$('#prereqDialog').close();renderStats();renderBoard();renderDetail();announce('Prerrequisitos personalizados guardados.');
  });
  $('#prereqDialog').addEventListener('close',()=>{editingChoices=null;});
  $$('.close-modal').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  $('#helpBtn').addEventListener('click',()=>$('#helpDialog').showModal());
  $('#themeBtn').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';theme();persist();});
  $('#menuBtn').addEventListener('click',openMobile);
  $('#closeSidebar').addEventListener('click',closeMobile);
  $('#mobileShade').addEventListener('click',closeMobile);
  $('#backupBtn').addEventListener('click',()=>{downloadJSON(state,'trama-uls-respaldo.json');announce('Respaldo descargado. Guárdalo en un lugar seguro.');});
  $('#restoreBtn').addEventListener('click',()=>$('#restoreFile').click());
  $('#restoreFile').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>4000000)throw new Error('Archivo demasiado grande (máximo 4 MB).');
      const parsed=JSON.parse(await file.text());
      const next=cleanImportedBackup(parsed,catalog.careers.map(c=>c.id),catalog.plans.map(p=>p.id));
      if(!confirm('¿Restaurar este respaldo? Reemplazará el progreso y las mallas personalizadas guardadas en este navegador.'))return;
      state=next;persist();theme();changeCareer(activeCareer.id,activePlan?.id);renderCatalog();announce('Respaldo restaurado.');
    }catch(error){announce(`No se pudo restaurar: ${error.message}`);}
    finally{e.target.value='';}
  });
  $('#shareBtn').addEventListener('click',async()=>{
    if(!activePlan){announce('Selecciona un plan antes de compartir.');return;}
    if(activePlan.quality==='personal') {announce('Las mallas personales solo están en tu dispositivo; expórtalas en un respaldo.');return;}
    const url=window.location.href;
    try{await navigator.clipboard.writeText(url);announce('Enlace de esta malla copiado.');}
    catch{window.prompt('Copia el enlace de la malla:',url);}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeDetail();closeMobile();}
    if(e.key==='/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')){e.preventDefault();$('#subjectSearch').focus();}
  });
  window.addEventListener('resize',()=>{if(selectedCourseId)drawRelations();});
  window.addEventListener('popstate',()=>{
    const url=new URL(window.location.href);const career=url.searchParams.get('c');
    if(catalog.careers.some(c=>c.id===career))changeCareer(career,url.searchParams.get('p'));
  });
}
async function boot() {
  theme();listeners();
  try{
    const response=await fetch('./data/catalog.json');if(!response.ok)throw Error(`HTTP ${response.status}`);
    catalog=await response.json();
    if(!Array.isArray(catalog.careers)||!Array.isArray(catalog.plans))throw Error('Catálogo inválido');
    state.customPlans=state.customPlans.filter(p=>validateCustomPlan(p,catalog.careers.map(c=>c.id)));
    initializeFacultyOptions();
    const url=new URL(window.location.href);
    const requested=url.searchParams.get('c');
    changeCareer(catalog.careers.some(c=>c.id===requested)?requested:'ici',url.searchParams.get('p'));
  }catch(error){
    $('#board').innerHTML='<div class="empty-state"><div class="empty-illustration">!</div><h3>No se pudo cargar el catálogo.</h3><p>Los archivos JSON deben abrirse mediante un servidor web. Publica la carpeta completa en GitHub Pages o ejecuta <code>python3 -m http.server 5173</code> en esta carpeta.</p></div>';
    $('#sourceBanner').className='source-banner error';
    $('#sourceBanner').textContent='Error al cargar los datos de mallas.';
    console.error(error);announce('Error de carga. Consulta la guía README.');
  }
}
boot();
