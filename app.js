/**
 * app.js — Declare Availability Widget (Grist Custom Widget)
 * ─────────────────────────────────────────────────────────────────
 * Lets a user declare that their desk is available for a date range.
 * Writes one record to Setting_available_place with:
 *   - people       → Reference row ID from People table
 *   - start_date   → Unix timestamp (seconds, midnight local time)
 *   - end_date     → Unix timestamp (seconds, midnight local time)
 *   - am/pm        → 'Morning', 'Afternoon', or '' for All day
 *
 * Sections:
 *   1. Configuration
 *   2. State
 *   3. Date helpers
 *   4. Autocomplete
 *   5. Period selector
 *   6. Date shortcuts
 *   7. Preview
 *   8. Submit
 *   9. Grist API
 *  10. UI helpers
 *  11. Bootstrap
 */


/* ═══════════════════════════════════════════════════════════════
   1. CONFIGURATION
════════════════════════════════════════════════════════════════ */
const CONFIG = {
  tables: {
    people:          'People',
    availability:    'Setting_available_place',
  },
  peopleCols: {
    name: 'people',       // display name column in People table
  },
  availCols: {
    people:     'people',      // Reference to People
    startDate:  'start_date',  // Date (stored as Unix ts in seconds)
    endDate:    'end_date',    // Date (stored as Unix ts in seconds)
    period:     'am/pm',       // Choice: 'Morning', 'Afternoon', or ''
  },
};


/* ═══════════════════════════════════════════════════════════════
   2. STATE
════════════════════════════════════════════════════════════════ */
let people = []; // { id, name } from People table


/* ═══════════════════════════════════════════════════════════════
   3. DATE HELPERS
════════════════════════════════════════════════════════════════ */

/**
 * Convert a date input value (YYYY-MM-DD string) to a Unix
 * timestamp in seconds at midnight local time.
 * Grist Date columns expect Unix timestamps in seconds.
 * @param {string} dateStr  e.g. "2025-06-16"
 * @returns {number|null}
 */
function dateToUnix(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
}

/**
 * Convert a JS Date to a YYYY-MM-DD string for date inputs.
 * @param {Date} d
 * @returns {string}
 */
function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a YYYY-MM-DD string as DD/MM/YYYY for display.
 * @param {string} dateStr
 * @returns {string}
 */
function fmtDisplay(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Get the Monday of the week containing a given date */
function getMonday(d) {
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}


/* ═══════════════════════════════════════════════════════════════
   4. AUTOCOMPLETE — "Who are you?"
════════════════════════════════════════════════════════════════ */
function initAutocomplete() {
  const input     = document.getElementById('who-input');
  const list      = document.getElementById('who-list');
  const hiddenId  = document.getElementById('who-id');
  let activeIdx   = -1;

  function showSuggestions(query) {
    list.innerHTML = '';
    activeIdx = -1;
    const q = query.trim().toLowerCase();
    const matches = q === ''
      ? people
      : people.filter(p => p.name.toLowerCase().includes(q));

    if (!matches.length) { list.classList.remove('open'); return; }

    matches.forEach(person => {
      const li = document.createElement('li');
      if (q) {
        const i = person.name.toLowerCase().indexOf(q);
        li.innerHTML = person.name.slice(0, i)
          + `<mark>${person.name.slice(i, i + q.length)}</mark>`
          + person.name.slice(i + q.length);
      } else {
        li.textContent = person.name;
      }
      li.addEventListener('mousedown', e => { e.preventDefault(); confirm(person); });
      list.appendChild(li);
    });
    list.classList.add('open');
  }

  function confirm(person) {
    input.value    = person.name;
    hiddenId.value = person.id;
    input.classList.add('confirmed');
    list.classList.remove('open');
    list.innerHTML = '';
    activeIdx = -1;
    updatePreview();
  }

  input.addEventListener('input', () => {
    input.classList.remove('confirmed');
    hiddenId.value = '';
    showSuggestions(input.value);
    updatePreview();
  });
  input.addEventListener('focus', () => showSuggestions(input.value));
  input.addEventListener('blur', () => {
    setTimeout(() => {
      list.classList.remove('open');
      const exact = people.find(p => p.name.toLowerCase() === input.value.trim().toLowerCase());
      if (exact) confirm(exact);
    }, 150);
  });
  input.addEventListener('keydown', e => {
    const items = list.querySelectorAll('li');
    if (!list.classList.contains('open') || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) {
        const name = items[activeIdx].textContent;
        confirm(people.find(p => p.name === name) || { id: name, name });
      }
      return;
    } else if (e.key === 'Escape') { list.classList.remove('open'); return; }
    items.forEach((li, i) => li.classList.toggle('active', i === activeIdx));
    if (activeIdx >= 0) items[activeIdx].scrollIntoView({ block: 'nearest' });
  });
}


/* ═══════════════════════════════════════════════════════════════
   5. PERIOD SELECTOR
════════════════════════════════════════════════════════════════ */
function initPeriodSelector() {
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('period-value').value = btn.dataset.value;
      updatePreview();
    });
  });
}


/* ═══════════════════════════════════════════════════════════════
   6. DATE SHORTCUTS
════════════════════════════════════════════════════════════════ */
function setDates(start, end) {
  document.getElementById('start-date').value = toInputDate(start);
  document.getElementById('end-date').value   = toInputDate(end || start);
  updatePreview();
}

function setToday() {
  setDates(new Date());
}

function setTomorrow() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  setDates(t);
}

function setThisWeek() {
  const mon = getMonday(new Date());
  const fri = new Date(mon);
  fri.setDate(fri.getDate() + 4);
  setDates(mon, fri);
}

function setNextWeek() {
  const mon = getMonday(new Date());
  mon.setDate(mon.getDate() + 7);
  const fri = new Date(mon);
  fri.setDate(fri.getDate() + 4);
  setDates(mon, fri);
}

// Keep end date ≥ start date automatically
function initDateSync() {
  document.getElementById('start-date').addEventListener('change', () => {
    const s = document.getElementById('start-date').value;
    const e = document.getElementById('end-date').value;
    if (s && e && e < s) {
      document.getElementById('end-date').value = s;
    }
    updatePreview();
  });
  document.getElementById('end-date').addEventListener('change', updatePreview);
  document.getElementById('weekdays-only').addEventListener('change', updatePreview);
}


/* ═══════════════════════════════════════════════════════════════
   7. PREVIEW
   Shows a summary of what will be written before the user submits.
════════════════════════════════════════════════════════════════ */

/**
 * Count weekdays (Mon–Fri) between two YYYY-MM-DD strings inclusive.
 * @param {string} startStr
 * @param {string} endStr
 * @param {boolean} weekdaysOnly
 * @returns {number}
 */
function countDays(startStr, endStr, weekdaysOnly) {
  if (!startStr || !endStr) return 0;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  let cur   = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  let count = 0;
  while (cur <= end) {
    const dow = cur.getDay();
    if (!weekdaysOnly || (dow !== 0 && dow !== 6)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function updatePreview() {
  const name        = document.getElementById('who-input').value.trim();
  const startStr    = document.getElementById('start-date').value;
  const endStr      = document.getElementById('end-date').value;
  const period      = document.getElementById('period-value').value;
  const weekdays    = document.getElementById('weekdays-only').checked;
  const previewEl   = document.getElementById('preview');

  if (!name || !startStr || !endStr) {
    previewEl.classList.remove('visible');
    return;
  }

  const periodLabel = period || 'All day';
  const days        = countDays(startStr, endStr, weekdays);
  const rangeLabel  = startStr === endStr
    ? fmtDisplay(startStr)
    : `${fmtDisplay(startStr)} → ${fmtDisplay(endStr)}`;
  const weekdayNote = weekdays ? ' (weekdays only)' : '';

  previewEl.innerHTML = `
    <strong>${name}</strong> will be available<br>
    📅 ${rangeLabel}${weekdayNote}<br>
    🕐 ${periodLabel}<br>
    <span style="opacity:0.7">${days} day${days !== 1 ? 's' : ''} will be declared</span>
  `;
  previewEl.classList.add('visible');
}


/* ═══════════════════════════════════════════════════════════════
   8. SUBMIT
   Writes one record per qualifying day to Setting_available_place.
   Each record:
     people     → Reference row ID
     start_date → Unix ts (midnight local)
     end_date   → Unix ts (midnight local) — same as start_date (one row per day)
     am/pm      → 'Morning', 'Afternoon', or null for All day
════════════════════════════════════════════════════════════════ */
async function submitAvailability() {
  const whoId    = document.getElementById('who-id').value;
  const whoName  = document.getElementById('who-input').value.trim();
  const startStr = document.getElementById('start-date').value;
  const endStr   = document.getElementById('end-date').value;
  const period   = document.getElementById('period-value').value;
  const weekdays = document.getElementById('weekdays-only').checked;

  if (!whoId)    { showToast('Please select a person', 'error'); return; }
  if (!startStr) { showToast('Please select a start date', 'error'); return; }
  if (!endStr)   { showToast('Please select an end date', 'error'); return; }

  const btn = document.getElementById('submit-btn');
  btn.classList.add('loading');
  btn.textContent = 'Saving…';

  // Build one AddRecord action per qualifying day
  const actions = [];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  let cur   = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  while (cur <= end) {
    const dow = cur.getDay();
    if (!weekdays || (dow !== 0 && dow !== 6)) {
      const ts = Math.floor(cur.getTime() / 1000);
      actions.push(['AddRecord', CONFIG.tables.availability, null, {
        [CONFIG.availCols.people]:    parseInt(whoId, 10),
        [CONFIG.availCols.startDate]: ts,
        [CONFIG.availCols.endDate]:   ts,
        [CONFIG.availCols.period]:    period || null,
      }]);
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (!actions.length) {
    showToast('No days to declare (check date range)', 'error');
    btn.classList.remove('loading');
    btn.textContent = 'Declare availability';
    return;
  }

  try {
    await grist.docApi.applyUserActions(actions);
    showToast(`✓ ${actions.length} day${actions.length > 1 ? 's' : ''} declared for ${whoName}`, 'success');

    // Reset form
    document.getElementById('who-input').value   = '';
    document.getElementById('who-input').classList.remove('confirmed');
    document.getElementById('who-id').value      = '';
    document.getElementById('start-date').value  = '';
    document.getElementById('end-date').value    = '';
    document.getElementById('period-value').value = '';
    document.querySelectorAll('.period-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.getElementById('preview').classList.remove('visible');

  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }

  btn.classList.remove('loading');
  btn.textContent = 'Declare availability';
}


/* ═══════════════════════════════════════════════════════════════
   9. GRIST API
════════════════════════════════════════════════════════════════ */
async function fetchPeople() {
  try {
    const data = await grist.docApi.fetchTable(CONFIG.tables.people);
    const ids   = data.id || [];
    const names = data[CONFIG.peopleCols.name] || [];
    people = ids.map((id, i) => ({
      id,
      name: String(names[i] || '').trim(),
    })).filter(p => p.name);
  } catch (e) {
    showToast('Could not load People table', 'error');
  }
}


/* ═══════════════════════════════════════════════════════════════
   10. UI HELPERS
════════════════════════════════════════════════════════════════ */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => { t.className = 'toast'; }, 3000);
}


/* ═══════════════════════════════════════════════════════════════
   11. BOOTSTRAP
════════════════════════════════════════════════════════════════ */
grist.ready({ requiredAccess: 'full' });

(async () => {
  await fetchPeople();
  initAutocomplete();
  initPeriodSelector();
  initDateSync();

  // Default both dates to today
  const today = toInputDate(new Date());
  document.getElementById('start-date').value = today;
  document.getElementById('end-date').value   = today;
})();
