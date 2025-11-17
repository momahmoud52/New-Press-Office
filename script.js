/* script.js */
/* File path: script.js */
/* Minimal comments: explain the why where needed */

// Constants and helper data
const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const STORAGE_KEY = 'mac_timeline_v1';
const AUTH_KEY = 'mac_editor_auth';

// DOM refs
const timelineWrapper = document.getElementById('timelineWrapper');
const addTaskBtn = document.getElementById('addTaskBtn');
const editorHint = document.getElementById('editorHint');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const yearEl = document.getElementById('year');

// Modal refs
const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const taskMonth = document.getElementById('taskMonth');
const taskTitle = document.getElementById('taskTitle');
const taskDesc = document.getElementById('taskDesc');
const taskDate = document.getElementById('taskDate');
const modalTitle = document.getElementById('modalTitle');
const closeModal = document.getElementById('closeModal');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');

let data = null; // loaded timeline data
let currentEdit = null; // {monthIdx, taskIdx} or null
let timers = new Map(); // interval timers for countdowns

// Utility: create empty data structure if none
function defaultData(){
  const obj = {};
  for(let i=0;i<12;i++) obj[i]=[]; // months 0..11
  return obj;
}

// Load/save
function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  try{
    data = raw ? JSON.parse(raw) : defaultData();
    // ensure structure
    for(let i=0;i<12;i++) if(!Array.isArray(data[i])) data[i]=[];
  }catch(e){
    data = defaultData();
  }
}
function saveData(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Auth helpers
function isEditor(){
  return !!localStorage.getItem(AUTH_KEY);
}
function setEditorSession(){
  localStorage.setItem(AUTH_KEY, '1'); // minimal session token
}
function clearEditorSession(){
  localStorage.removeItem(AUTH_KEY);
}

// Render functions
function render(){
  // clear timers
  timers.forEach((v)=>clearInterval(v));
  timers.clear();
  timelineWrapper.innerHTML = '';
  // show editor UI if logged in
  const editor = isEditor();
  editorHint.style.display = editor ? 'block' : 'none';
  loginBtn.style.display = editor ? 'none' : 'inline-block';
  logoutBtn.style.display = editor ? 'inline-block' : 'none';

  // render months
  for(let m=0;m<12;m++){
    const card = document.createElement('div');
    card.className = 'month-card';
    card.innerHTML = `
      <div class="month-header">
        <div>
          <div class="month-title"><span class="dot"></span>${MONTHS_AR[m]}</div>
          <div class="month-sub">${data[m].length} مهمة</div>
        </div>
        <div>${!editor ? '' : `<button class="btn ghost small add-inline" data-month="${m}">إضافة</button>`}</div>
      </div>
      <div class="task-list" id="list-${m}"></div>
    `;
    timelineWrapper.appendChild(card);

    const list = card.querySelector(`#list-${m}`);
    if(data[m].length===0){
      list.innerHTML = `<div style="opacity:0.55;font-size:13px;padding:8px">لا توجد مهام لهذا الشهر</div>`;
    }else{
      data[m].forEach((t, idx) => {
        const taskEl = document.createElement('div');
        taskEl.className = 'task' + (t.completed ? ' completed' : '');
        taskEl.dataset.month = m;
        taskEl.dataset.idx = idx;

        // compute due date textual
        const due = t.due ? new Date(t.due) : null;
        const dueText = due ? timeRemainingText(due) : '—';

        // checkbox svg
        const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        taskEl.innerHTML = `
          <div class="task-head">
            <div>
              <div class="title">${escapeHtml(t.title)}</div>
              <div class="countdown" id="cd-${m}-${idx}">${escapeHtml(dueText)}</div>
            </div>
            <div style="display:flex;gap:12px;align-items:center">
<div class="checkbox ${t.completed ? 'active' : ''} ${editor ? '' : 'disabled'}" 
     data-month="${m}" data-idx="${idx}" 
     ${editor ? '' : 'style="pointer-events:none;opacity:0.45"'}
     title="${editor ? 'تغيير حالة المهمة' : 'للمحرر فقط'}">
     ${checkSvg}
</div>
              ${editor ? `<button class="btn ghost edit-btn" data-month="${m}" data-idx="${idx}">تعديل</button>` : ''}
            </div>
          </div>
          <div class="desc">${escapeHtml(t.desc || '')}</div>
        `;

        list.appendChild(taskEl);

        // start countdown timer
        if(due){
          startCountdown(due, document.getElementById(`cd-${m}-${idx}`), () => {
            // no-op on end; renderer will show 'انتهى'
          });
        }
      });
    }
  }

  // attach inline add buttons handlers
  document.querySelectorAll('.add-inline').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      openModalForAdd(parseInt(btn.dataset.month,10));
    })
  });

  // attach edit buttons
  document.querySelectorAll('.edit-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const m = parseInt(btn.dataset.month,10), idx=parseInt(btn.dataset.idx,10);
      openModalForEdit(m, idx);
    })
  });

  // attach checkbox handlers
 document.querySelectorAll('.checkbox').forEach(cb=>{
  if(!cb.classList.contains('disabled')){
    cb.addEventListener('click', ()=>{
      const m = parseInt(cb.dataset.month,10), idx=parseInt(cb.dataset.idx,10);
      toggleComplete(m, idx, cb);
    });
  }
});

}

// Escape helper (very small) to avoid accidental HTML injection on titles/descriptions
function escapeHtml(s){
  if(!s) return '';
  return String(s).replace(/[&<>"']/g, function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]});
}

// Countdown functions — update text every second
function timeRemainingText(due){
  const now = new Date();
  const diff = due - now;
  if(isNaN(diff)) return '—';
  if(diff <= 0) return 'انتهى';
  const days = Math.floor(diff / (1000*60*60*24));
  const hrs = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
  const mins = Math.floor((diff % (1000*60*60)) / (1000*60));
  const secs = Math.floor((diff % (1000*60)) / 1000);
  if(days>0) return `${days} يوم ${hrs} س`;
  if(hrs>0) return `${hrs} س ${mins} د`;
  if(mins>0) return `${mins} د ${secs} ث`;
  return `${secs} ث`;
}
function startCountdown(due, el, onEnd){
  const key = `${el.id}`;
  function tick(){
    el.textContent = timeRemainingText(new Date(due));
    if(new Date(due) - new Date() <= 0){
      el.textContent = 'انتهى';
      onEnd && onEnd();
      // clear interval
      if(timers.has(key)){ clearInterval(timers.get(key)); timers.delete(key); }
    }
  }
  tick();
  const id = setInterval(tick, 1000);
  timers.set(key, id);
}

// Modal open/close and form handling
function openModalForAdd(monthIdx){
  currentEdit = null;
  modalTitle.textContent = 'إضافة مهمة';
  taskMonth.value = monthIdx ?? 0;
  taskTitle.value = '';
  taskDesc.value = '';
  taskDate.value = '';
  openModal();
}
function openModalForEdit(monthIdx, taskIdx){
  currentEdit = {monthIdx, taskIdx};
  const t = data[monthIdx][taskIdx];
  modalTitle.textContent = 'تعديل مهمة';
  taskMonth.value = monthIdx;
  taskTitle.value = t.title || '';
  taskDesc.value = t.desc || '';
  // format datetime-local
  if(t.due){
    const dt = new Date(t.due);
    const localISO = dt.toISOString().slice(0,16);
    taskDate.value = localISO;
  } else taskDate.value = '';
  openModal();
}
function openModal(){
  taskModal.setAttribute('aria-hidden','false');
}
function closeModalFunc(){
  taskModal.setAttribute('aria-hidden','true');
  currentEdit = null;
}
closeModal.addEventListener('click', closeModalFunc);
cancelTaskBtn.addEventListener('click', closeModalFunc);
taskModal.addEventListener('click', (e)=>{ if(e.target === taskModal) closeModalFunc(); });

// Save task event
taskForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const m = parseInt(taskMonth.value,10);
  const title = taskTitle.value.trim();
  const desc = taskDesc.value.trim();
  const due = taskDate.value ? new Date(taskDate.value).toISOString() : null;
  if(!title){ alert('الرجاء إضافة عنوان للمهمة'); return; }

  if(currentEdit){
    const {monthIdx, taskIdx} = currentEdit;
    data[monthIdx][taskIdx].title = title;
    data[monthIdx][taskIdx].desc = desc;
    data[monthIdx][taskIdx].due = due;
  }else{
    const taskObj = {
      id: Date.now(),
      title, desc, due,
      completed:false,
      createdAt: (new Date()).toISOString()
    };
    data[m].push(taskObj);
  }
  saveData();
  closeModalFunc();
  render();
});

// Toggle complete and animate
function toggleComplete(m, idx, cbEl){
  const t = data[m][idx];
  t.completed = !t.completed;
  saveData();

  // animate checkbox
  if(t.completed){
    cbEl.classList.add('active');
  } else cbEl.classList.remove('active');
  render();
}

// Login/logout wiring
logoutBtn.addEventListener('click', ()=>{
  clearEditorSession();
  render();
});

// Inline add button (from main addTaskBtn)
if(addTaskBtn) addTaskBtn.addEventListener('click', ()=> openModalForAdd(new Date().getMonth()));

// initial boot
(function init(){
  yearEl.textContent = new Date().getFullYear();
  loadData();

  // If no data present at all, create sample content for demonstration (only if empty)
  let hasAny = false;
  for(let i=0;i<12;i++) if(data[i].length) { hasAny=true; break;}
  if(!hasAny){
    // sample tasks for demo purposes
    data[0].push({id:1,title:'نشر تقرير افتتاحي',desc:'نشر تقرير يوضح خطة القسم',due: new Date(Date.now() + 1000*60*60*24*6).toISOString(),completed:false,createdAt:new Date().toISOString()});
    data[1].push({id:2,title:'حملة تواصل اجتماعي',desc:'خطة أسبوعية للحملة',due: new Date(Date.now() + 1000*60*60*24*20).toISOString(),completed:false,createdAt:new Date().toISOString()});
    saveData();
  }

  // If the user is coming from login with a token param
  const urlParams = new URLSearchParams(window.location.search);
  if(urlParams.get('editor') === '1'){ setEditorSession(); window.history.replaceState({}, document.title, window.location.pathname); }

  render();
})();
