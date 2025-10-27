// app.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { plan, promptsForDay, validateCloze } from "./bible.js";

const SUPABASE_URL = "https://jqfyctgrrmyctsrtpucc.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZnljdGdycm15Y3RzcnRwdWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MTcxNjQsImV4cCI6MjA3NzA5MzE2NH0.dYbhLYrZohhdtHDi4Pu1UqY7MZHJNpKDJNyh3eWXfe4";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

const els = {
  authCard: document.getElementById('authCard'),
  setupCard: document.getElementById('setupCard'),
  todayCard: document.getElementById('todayCard'),
  weeklyCard: document.getElementById('weeklyCard'),
  teamCard: document.getElementById('teamCard'),
  magicBtn: document.getElementById('magicBtn'),
  email: document.getElementById('email'),
  userLine: document.getElementById('userLine'),

  displayName: document.getElementById('displayName'),
  roleSel: document.getElementById('roleSel'),
  startDate: document.getElementById('startDate'),
  startWeight: document.getElementById('startWeight'),
  targetMode: document.getElementById('targetMode'),
  saveConfig: document.getElementById('saveConfig'),

  dayTitle: document.getElementById('dayTitle'),
  lockNote: document.getElementById('lockNote'),
  workout: document.getElementById('workout'),
  spiritual: document.getElementById('spiritual'),
  outdoor: document.getElementById('outdoor'),
  water: document.getElementById('water'),
  bible: document.getElementById('bible'),
  photoPhysical: document.getElementById('photoPhysical'),
  photoSpiritual: document.getElementById('photoSpiritual'),
  saveDaily: document.getElementById('saveDaily'),

  readingBlock: document.getElementById('readingBlock'),
  rev: document.getElementById('rev'),
  conv: document.getElementById('conv'),
  trans: document.getElementById('trans'),
  saveBible: document.getElementById('saveBible'),

  weekTitle: document.getElementById('weekTitle'),
  weighIn: document.getElementById('weighIn'),
  weeklyPhoto: document.getElementById('weeklyPhoto'),
  goalHelp: document.getElementById('goalHelp'),
  saveWeekly: document.getElementById('saveWeekly'),

  teamRevs: document.getElementById('teamRevs'),
  galleryCard: document.getElementById('galleryCard'),
  dailyGallery: document.getElementById('dailyGallery'),
  weeklyGallery: document.getElementById('weeklyGallery')
};

// ---------- Auth ----------
els.magicBtn.onclick = async () => {
  const { error } = await sb.auth.signInWithOtp({
    email: els.email.value,
    options: { emailRedirectTo: location.href }
  });
  alert(error ? error.message : "Magic link sent! Check your email.");
};

sb.auth.onAuthStateChange(async (_evt, session) => {
  if (session?.user) {
    els.authCard.style.display = 'none';
    els.userLine.innerHTML = `<small>Signed in as ${session.user.email}</small>`;
    await ensureProfile(session.user.id);
    await initApp();
  } else {
    els.authCard.style.display = 'block';
  }
});

(async ()=>{
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    els.authCard.style.display = 'none';
    els.userLine.innerHTML = `<small>Signed in as ${session.user.email}</small>`;
    await ensureProfile(session.user.id);
    await initApp();
  }
})();

async function ensureProfile(uid){
  const { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (!data) {
    els.setupCard.style.display = 'block';
    els.saveConfig.onclick = async () => {
      const role = els.roleSel.value;               // michael | luis | sister
      const pctMap = { michael: 0.008, luis: 0.012, sister: 0.002 };
      const weekly_pct = pctMap[role];
      const display_name = els.displayName.value || role[0].toUpperCase()+role.slice(1);

      const ins1 = await sb.from('profiles').insert({ id: uid, display_name, role });
      if (ins1.error) return alert(ins1.error.message);

      const ins2 = await sb.from('start_configs').insert({
        user_id: uid,
        role,
        start_weight_lbs: Number(els.startWeight.value),
        start_date: els.startDate.value,
        target_mode: (role==='sister') ? 'gain' : (role==='luis' ? 'fat_loss' : 'recomp'),
        weekly_pct
      });
      if (ins2.error) return alert(ins2.error.message);

      els.setupCard.style.display = 'none';
      await initApp();
    };
  }
}

// ---------- App ----------
let CURRENT = { cfg: null, day: 1, week: 0, role: "michael" };

async function initApp(){
  const { data: { user} } = await sb.auth.getUser();
  const { data: cfg } = await sb.from('start_configs').select('*').eq('user_id', user.id).maybeSingle();
  if (!cfg) { els.setupCard.style.display = 'block'; return; }

  CURRENT.cfg = cfg;
  CURRENT.role = cfg.role;

  const start = new Date(cfg.start_date + 'T00:00:00');
  const today = new Date();
  const dDiff = Math.floor((Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()) - Date.UTC(start.getFullYear(),start.getMonth(),start.getDate()))/86400000);
  const dayNumber = Math.min(70, Math.max(1, dDiff + 1));
  const weekNumber = Math.min(10, Math.max(0, Math.floor(dDiff/7)));
  CURRENT.day = dayNumber; CURRENT.week = weekNumber;

  // Today card
  els.todayCard.style.display = 'block';
  els.dayTitle.textContent = `Day ${dayNumber} — ${labelForDecade(dayNumber)} (${translationName(cfg.role)})`;
  const locked = dDiff < 0;
  els.lockNote.innerHTML = locked ? `<span class="badge">Locked until ${cfg.start_date}</span>` : `<span class="badge">Open</span>`;
  toggleLock(els.todayCard, locked);

  // Preload toggles
  const { data: daily } = await sb.from('daily_checks').select('*')
    .eq('user_id', user.id).eq('day_number', dayNumber).maybeSingle();
  if (daily){
    els.workout.checked = daily.workout_done;
    els.spiritual.checked = daily.spiritual_done;
    els.outdoor.checked = daily.outdoor_done;
    els.water.checked = daily.water_gal;
    els.bible.checked = daily.bible_read;
  }

  // Reading + quiz UI
  renderReading(dayNumber, cfg.role);

  // Journal
  const { data: note } = await sb.from('bible_notes').select('*')
    .eq('user_id', user.id).eq('day_number', dayNumber).maybeSingle();
  if (note){
    els.rev.value = note.revelation || '';
    els.conv.value = note.conviction || '';
    els.trans.value = note.transformation || '';
  }

  // Weekly
  els.weeklyCard.style.display = 'block';
  els.weekTitle.textContent = `Weekly Check — Week ${weekNumber}`;
  const weekLocked = dDiff < weekNumber*7;
  toggleLock(els.weeklyCard, weekLocked);
  setGoalBadge(cfg);

  // Team views
  els.teamCard.style.display = 'block';
  loadTeamFeed();
  loadGallery();

  // Handlers
  els.saveDaily.onclick = () => saveDaily(dayNumber);
  els.saveBible.onclick = () => saveBible(dayNumber);
  els.saveWeekly.onclick = () => saveWeekly(weekNumber);
}

function toggleLock(section, locked){
  section.querySelectorAll('input,textarea,button').forEach(el=>{
    if (locked) el.setAttribute('disabled','');
    else el.removeAttribute('disabled');
  });
  section.classList.toggle('locked', locked);
}

function labelForDecade(d){
  if (d<=10) return "Exile Begins";
  if (d<=20) return "The Grind";
  if (d<=30) return "Breakthrough of Rhythm";
  if (d<=40) return "Testing in the Wilderness";
  if (d<=50) return "Vision Returns";
  if (d<=60) return "Sealing of Strength";
  return "Restoration";
}

function translationName(role){
  return role==='sister' ? "NLT" : "NASB 1995";
}

// -------- Reading + Quiz --------
function renderReading(day, role){
  const refs = plan[day-1].refs;
  const clozes = promptsForDay(day, role);

  const list = refs.map(r=>`<li>${r.book} ${r.chapter}</li>`).join('');
  const quiz = clozes.map((c,i)=>{
    const blanks = Array.from({length:c.blanks},(_,k)=>`
      <input class="blankInput" data-qi="${i}" data-slot="${k}" placeholder="word ${k+1}" />
    `).join('');
    return `
      <div class="card">
        <div><b>${c.ref}</b></div>
        <div><small class="muted">${c.prompt}</small></div>
        <div class="grid two" style="margin-top:8px">${blanks}</div>
        <button class="primary" style="margin-top:8px" onclick="window._grade(${day}, ${i})">Check</button>
        <div id="qres-${i}" style="margin-top:6px"></div>
      </div>
    `;
  }).join('');

  els.readingBlock.innerHTML = `
    <h4>Reading — ${refs.map(r=>`${r.book} ${r.chapter}`).join(', ')} <small class="muted">(${translationName(role)})</small></h4>
    <ol style="margin-top:6px">${list}</ol>
    <hr/>
    <h4>Quick Blanks</h4>
    ${quiz}
    <small class="muted">Blanks expect 1–2 key words found in your translation; no verse text is shown here.</small>
  `;

  window._grade = (day, idx)=>{
    const cl = promptsForDay(day, role)[idx];
    const inputs = Array.from(document.querySelectorAll(`input.blankInput[data-qi="${idx}"]`))
                  .sort((a,b)=>Number(a.dataset.slot)-Number(b.dataset.slot))
                  .map(i=>i.value);
    const { ok, which } = validateCloze(inputs, cl);
    const res = document.getElementById(`qres-${idx}`);
    if (ok){
      res.innerHTML = `<span class="badge">✅ Looks good</span>`;
      els.bible.checked = true;
    } else {
      const tips = which.map((w,j)=> w? `slot ${j+1}: ✅` : `slot ${j+1}: ❌ try a different key word`).join(' — ');
      res.innerHTML = `<span class="badge">${tips}</span>`;
    }
  };
}

// ------- Save Daily -------
async function saveDaily(dayNumber){
  const { data: { user } } = await sb.auth.getUser();

  // Upload PUBLIC photos to 'public-media'
  let physical_photo_path = null;
  let spiritual_photo_path = null;

  const upPublic = async (file, key) => {
    const { error } = await sb.storage.from('public-media')
      .upload(key, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return key;
  };

  const phys = els.photoPhysical.files[0];
  if (phys){
    const key = `${user.id}/day-${dayNumber}-physical-${Date.now()}.jpg`;
    physical_photo_path = await upPublic(phys, key);
  }

  const spir = els.photoSpiritual.files[0];
  if (spir){
    const key = `${user.id}/day-${dayNumber}-spiritual-${Date.now()}.jpg`;
    spiritual_photo_path = await upPublic(spir, key);
  }

  const payload = {
    user_id: user.id, day_number: dayNumber,
    workout_done: els.workout.checked,
    spiritual_done: els.spiritual.checked,
    outdoor_done: els.outdoor.checked,
    water_gal: els.water.checked,
    bible_read: els.bible.checked,
    ...(physical_photo_path ? { physical_photo_path } : {}),
    ...(spiritual_photo_path ? { spiritual_photo_path } : {})
  };

  const { error } = await sb.from('daily_checks').upsert(payload, { onConflict: 'user_id,day_number' });
  alert(error ? error.message : "Saved ✅");
  if (!error) loadGallery();
}

// ------- Save Bible -------
async function saveBible(dayNumber){
  const { data: { user } } = await sb.auth.getUser();
  const payload = {
    user_id: user.id, day_number: dayNumber,
    revelation: els.rev.value,
    conviction: els.conv.value,
    transformation: els.trans.value
  };
  const { error } = await sb.from('bible_notes').upsert(payload, { onConflict: 'user_id,day_number' });
  if (!error) loadTeamFeed();
  alert(error ? error.message : "Journal saved ✅");
}

// ------- Save Weekly -------
async function saveWeekly(weekNumber){
  const { data: { user } } = await sb.auth.getUser();

  let weekly_photo_path = null;
  const file = els.weeklyPhoto.files[0];
  if (file){
    const key = `${user.id}/week-${weekNumber}-progress-${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage.from('public-media')
      .upload(key, file, { contentType: file.type });
    if (upErr) return alert(upErr.message);
    weekly_photo_path = key;
  }

  const updateObj = { user_id: user.id, week_number: weekNumber };
  if (els.weighIn.value) updateObj.weight_lbs = Number(els.weighIn.value);
  if (weekly_photo_path) updateObj.weekly_photo_path = weekly_photo_path;

  const { error } = await sb.from('weights')
    .upsert(updateObj, { onConflict: 'user_id,week_number' });

  alert(error ? error.message : "Weekly saved ✅");
  if (!error) loadGallery();
}

// ------- Team Feed -------
async function loadTeamFeed(){
  const { data } = await sb.from('public_revelations')
    .select('*').order('created_at', { ascending:false }).limit(100);
  els.teamRevs.innerHTML = (data||[]).map(r=>`
    <div class="card">
      <div><b>${r.display_name}</b> — Day ${r.day_number}</div>
      <p>${escapeHtml(r.revelation)}</p>
      <small class="muted">${new Date(r.created_at).toLocaleString()}</small>
    </div>
  `).join('') || '<small class="muted">No entries yet.</small>';
}

// ------- Team Gallery -------
function publicUrl(path){
  const { data } = sb.storage.from('public-media').getPublicUrl(path);
  return data.publicUrl;
}

async function loadGallery(){
  els.galleryCard.style.display = 'block';

  // Daily media
  const { data: daily } = await sb.from('public_daily_media')
    .select('*').order('created_at', { ascending: false }).limit(60);

  els.dailyGallery.innerHTML = (daily && daily.length)
    ? daily.map(row => {
        const phys = row.physical_photo_path
          ? `<div><b>Physical</b><br><img class="media" src="${publicUrl(row.physical_photo_path)}" alt="physical"></div>`
          : '';
        const spir = row.spiritual_photo_path
          ? `<div><b>Spiritual</b><br><img class="media" src="${publicUrl(row.spiritual_photo_path)}" alt="spiritual"></div>`
          : '';
        return `
          <div class="card">
            <div><b>${row.display_name}</b> — Day ${row.day_number}</div>
            ${phys}${spir}
            <small class="muted">${new Date(row.created_at).toLocaleString()}</small>
          </div>
        `;
      }).join('')
    : '<small class="muted">No daily photos yet.</small>';

  // Weekly media
  const { data: weekly } = await sb.from('public_weekly_media')
    .select('*').order('created_at', { ascending: false }).limit(40);

  els.weeklyGallery.innerHTML = (weekly && weekly.length)
    ? weekly.map(row => `
        <div class="card">
          <div><b>${row.display_name}</b> — Week ${row.week_number}</div>
          <img class="media" src="${publicUrl(row.weekly_photo_path)}" alt="progress">
          <small class="muted">${new Date(row.created_at).toLocaleString()}</small>
        </div>
      `).join('')
    : '<small class="muted">No weekly progress photos yet.</small>';
}

function setGoalBadge(cfg){
  const pct = cfg.weekly_pct;
  let text = '';
  if (cfg.role==='sister') text = `Goal: +${(pct*100).toFixed(1)}% / week (lean gain, NLT)`;
  else text = `Goal: −${(pct*100).toFixed(1)}% / week (NASB95)`;
  els.goalHelp.textContent = text;
}

function escapeHtml(s){return (s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]))}
