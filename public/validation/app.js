const DEV = {
  done: { t: 'Fait — à valider', c: 'b-done' },
  in_progress: { t: 'En cours', c: 'b-progress' },
  waiting: { t: 'En attente', c: 'b-wait' },
  question: { t: 'Question', c: 'b-question' },
}
const AG = {
  pending: { t: 'À valider', c: 'b-ag' },
  validated: { t: 'Validé AG', c: 'b-ag-ok' },
  return: { t: 'Retour / à corriger', c: 'b-ag-ret' },
  recheck: { t: 'Corrigé — à re-confirmer', c: 'b-ag-recheck' },
  to_provide: { t: 'À fournir', c: 'b-wait' },
  question: { t: 'Question ouverte', c: 'b-question' },
}

const TOKEN_KEY = 'token'
let state = { data: null, filter: 'all', saving: new Set() }

function getAuthToken() {
  try {
    return (localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '').trim()
  } catch {
    return ''
  }
}

function getAuthUser() {
  try {
    const raw = localStorage.getItem('auth_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function hasWriteAccess() {
  return Boolean(getAuthToken())
}

function respondentName() {
  const u = getAuthUser()
  return u?.name || u?.email || 'Utilisateur'
}

function badge(map, key) {
  const x = map[key] || map.pending
  return `<span class="badge ${x.c}">${x.t}</span>`
}

function bar(pct, label, cls = '') {
  return `<div class="card wide"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>${label}</span><strong>${pct}%</strong></div><div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div></div>`
}

function rowClass(item) {
  if (item.ag === 'validated') return 'row-validated'
  if (item.ag === 'recheck') return 'row-recheck'
  if (item.ag === 'return') return 'row-return'
  if (item.ag === 'question') return 'row-question'
  return ''
}

function matchesFilter(item) {
  const f = state.filter
  if (f === 'all') return true
  if (f === 'dev_ready') return item.dev === 'done'
  if (f === 'ag_pending') return item.ag === 'pending' || item.ag === 'to_provide'
  if (f === 'ag_validated') return item.ag === 'validated'
  if (f === 'ag_return') return item.ag === 'return' || item.ag === 'question'
  if (f === 'ag_recheck') return item.ag === 'recheck'
  if (f === 'open') return Boolean(item.question) && item.ag !== 'validated'
  return true
}

function renderThread(item) {
  const parts = []
  const agWhen = item.agFeedbackAt || item.agUpdatedAt
  const agWho = item.agUpdatedBy || ''
  const isArthur = /arthur/i.test(agWho)
  if (item.agNote || item.agAnswer) {
    parts.push(`<div class="thread-block thread-armand"><div class="thread-label">Retour ${isArthur ? 'Arthur' : 'Armand / client'}</div>
      ${item.agAnswer ? `<p>${esc(item.agAnswer)}</p>` : ''}
      ${item.agNote ? `<p>${esc(item.agNote)}</p>` : ''}
      ${agWhen ? `<div class="thread-meta">${fmtDate(agWhen)}${agWho ? ` — ${esc(agWho)}` : ''}</div>` : ''}
    </div>`)
  }
  if (item.devResponse) {
    parts.push(`<div class="thread-block thread-dev"><div class="thread-label">Correction déployée — Xavier</div>
      <p>${esc(item.devResponse)}</p>
      ${item.devResponseAt ? `<div class="thread-meta">${fmtDate(item.devResponseAt)}${item.devResponseBy ? ` — ${esc(item.devResponseBy)}` : ''}</div>` : ''}
    </div>`)
  }
  if (item.ag === 'recheck') {
    parts.push('<div class="thread-banner">Merci de re-tester puis cliquer <strong>Validé</strong> ou <strong>Retour</strong> ci-dessous.</div>')
  }
  return parts.length ? `<div class="feedback-thread">${parts.join('')}</div>` : ''
}

function renderDevPanel(item) {
  if (!hasWriteAccess()) return ''
  const preset = {
    A7: 'Correction déployée : effacement cellule équipement → prix 0.',
    A9: 'Correction déployée : FB5 → FB6 + alerte.',
    A10: 'Correction déployée : R061 hors châssis/guichet.',
    A5: 'Correction déployée : CEM 990 €/vantail.',
    A1: 'Correction déployée : serrures 4172 + 4176 CR6.',
    B4: 'Correction déployée : poids dans PDF.',
    B5: 'Correction déployée : remise € ou %.',
    C2: 'Correction déployée : bandeau admin global.',
  }[item.id] || ''
  if (!preset && item.ag !== 'return' && item.ag !== 'recheck' && !item.devResponse) return ''
  return `<div class="dev-panel" data-item-id="${item.id}">
    <strong>🔧 Correction Xavier</strong>
    <textarea class="dev-response-input" rows="3" placeholder="Décrire la correction…">${esc(item.devResponse || preset)}</textarea>
    <button type="button" class="btn btn-sm btn-dev publish-dev-fix">Publier correction → re-validation</button>
  </div>`
}

function renderAgPanel(item) {
  const disabled = !hasWriteAccess() ? 'disabled' : ''
  const recheckHint = item.ag === 'recheck'
    ? '<p class="recheck-hint">Une correction a été publiée — merci de re-tester puis valider ou refaire un retour.</p>'
    : ''
  const qBlock = item.question
    ? `<p class="q-text">❓ ${item.question}</p>
       <textarea data-field="ag_answer" placeholder="Votre réponse…" ${disabled}>${esc(item.agAnswer || '')}</textarea>`
    : ''
  return `<div class="ag-panel" data-item-id="${item.id}">
    ${recheckHint}
    ${qBlock}
    <textarea data-field="ag_comment" placeholder="Commentaire / retour / précision…" ${disabled}>${esc(item.agNote || '')}</textarea>
    <div class="ag-btns">
      <button type="button" class="btn btn-sm btn-ok${item.ag === 'validated' ? ' active' : ''}" data-status="validated" ${disabled}>✓ Validé</button>
      <button type="button" class="btn btn-sm btn-warn${item.ag === 'return' ? ' active' : ''}" data-status="return" ${disabled}>↩ Retour</button>
      <button type="button" class="btn btn-sm btn-danger${item.ag === 'to_provide' ? ' active' : ''}" data-status="to_provide" ${disabled}>📎 À fournir</button>
      <button type="button" class="btn btn-sm${item.ag === 'question' ? ' active' : ''}" data-status="question" ${disabled}>? Autre</button>
    </div>
    <button type="button" class="btn btn-sm btn-primary save-row" ${disabled}>Enregistrer</button>
    <div class="save-status" aria-live="polite"></div>
  </div>`
}

function renderVerifyBlock(item) {
  if (!item.verifySteps?.length && !item.verifyCmd) return ''
  const steps = (item.verifySteps || []).map((s) => `<li>${esc(s)}</li>`).join('')
  const cmd = item.verifyCmd
    ? `<p class="note verify-cmd"><code>${esc(item.verifyCmd)}</code></p>`
    : ''
  const pageLink = item.appLink
    ? `<p class="verify-link">Page à ouvrir : <a href="${esc(item.appLink)}" target="_blank" rel="noopener">${esc(item.appLinkLabel || item.appLink)}</a></p>`
    : ''
  return `<details class="verify-details" open>
    <summary>Comment vérifier</summary>
    ${pageLink}
    <ol class="verify-list">${steps}</ol>
    ${cmd}
  </details>`
}

function renderAppLink(item) {
  if (!item.appLink) return '<span class="note">—</span>'
  return `<a class="app-link" href="${esc(item.appLink)}" target="_blank" rel="noopener">→ ${esc(item.appLinkLabel || 'Ouvrir')}</a>`
}

function renderCardDates(item) {
  const parts = []
  const agAt = item.agFeedbackAt
    || (item.ag !== 'pending' && !/équipe dev|equipe dev|xavier/i.test(String(item.agUpdatedBy || '')) ? item.agUpdatedAt : null)
  if (agAt && (item.ag !== 'pending' || item.agNote || item.agAnswer)) {
    const who = item.agUpdatedBy || 'Client'
    const action = item.ag !== 'pending' ? (AG[item.ag]?.t || item.ag) : ''
    parts.push(`<span class="item-date item-date--client"><time>${fmtDate(agAt)}</time> · ${esc(who)}${action ? ` · ${esc(action)}` : ''}</span>`)
  }
  if (item.devResponseAt) {
    const who = item.devResponseBy || 'Xavier'
    parts.push(`<span class="item-date item-date--dev"><time>${fmtDate(item.devResponseAt)}</time> · ${esc(who)} · Correction publiée</span>`)
  }
  return parts.length ? `<div class="item-dates">${parts.join('')}</div>` : ''
}

function renderItemRow(item) {
  const hidden = matchesFilter(item) ? '' : ' filtered-out'
  return `<article class="item-card ${rowClass(item)}${hidden}" data-id="${item.id}" data-dev="${item.dev}" data-ag="${item.ag}">
    <div class="item-main">
      <div class="item-title-row"><span class="id">${item.id}</span><h3>${esc(item.label)}</h3></div>
      <div class="item-badges">${badge(DEV, item.dev)}${badge(AG, item.ag)}</div>
      ${renderCardDates(item)}
      <div class="item-link">${renderAppLink(item)}</div>
      ${(item.devNote || item.neededToFinish) ? `<div class="item-notes">${item.devNote ? `<p>${esc(item.devNote)}</p>` : ''}${item.neededToFinish ? `<p>À confirmer : ${esc(item.neededToFinish)}</p>` : ''}</div>` : ''}
      ${renderVerifyBlock(item)}
      ${renderThread(item)}
    </div>
    <div class="item-feedback">${renderDevPanel(item)}${renderAgPanel(item)}</div>
  </article>`
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDate(v) {
  try {
    return new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return v
  }
}

function jalonAgPct(jalon) {
  const v = jalon.stats?.agValidated ?? jalon.items.filter((i) => i.ag === 'validated').length
  return Math.round((v / jalon.items.length) * 100)
}

function render() {
  const d = state.data
  if (!d) return
  const m = d.meta
  const items = [...d.jalons.flatMap((j) => j.items), ...d.files]
  const devDone = items.filter((i) => i.dev === 'done').length
  const devProg = items.filter((i) => i.dev === 'in_progress').length
  const devQ = items.filter((i) => i.dev === 'waiting' || i.dev === 'question').length
  const agPct = Math.round((d.summary.agValidated / d.summary.total) * 100)

  const filters = [
    ['all', 'Tout'],
    ['dev_ready', 'Dev fait → à valider'],
    ['ag_pending', 'En attente Armand'],
    ['ag_validated', 'Validé AG'],
    ['ag_recheck', 'À re-confirmer'],
    ['ag_return', 'Retour / question'],
    ['open', 'Questions ouvertes'],
  ]

  const user = getAuthUser()
  const authLabel = hasWriteAccess()
    ? `Connecté : ${esc(user?.name || user?.email || 'utilisateur')}`
    : 'Non connecté — lecture seule'

  let html = `
    <header class="page-head">
      <div>
        <p class="eyebrow">Validation interactive · Lot Armand</p>
        <h1>${esc(m.title)}</h1>
        <p class="sub">${esc(m.project)} — ${esc(m.client)} · MAJ ${esc(m.updatedAt)}</p>
      </div>
      <div class="head-actions">
        <span class="token-pill ${hasWriteAccess() ? '' : 'off'}">${authLabel}</span>
        ${hasWriteAccess() ? '' : '<a class="primary" href="/login">Se connecter</a>'}
        <a href="/">App devis</a>
        <a href="/suivi-armand">Vue intégrée</a>
        <a href="/validation/recette.md" target="_blank" rel="noopener">Doc recette</a>
        ${hasWriteAccess() ? '<button type="button" class="btn btn-sm btn-dev" id="bulk-dev-fix">Publier corrections → re-validation</button>' : ''}
      </div>
    </header>
    <div class="cards">
      <div class="card"><div class="num">${devDone}</div><div class="lbl">Dev fait</div></div>
      <div class="card"><div class="num">${devProg}</div><div class="lbl">En cours dev</div></div>
      <div class="card"><div class="num">${devQ}</div><div class="lbl">Question dev</div></div>
      <div class="card"><div class="num">${d.summary.agValidated}/${d.summary.total}</div><div class="lbl">Validé Armand</div></div>
      <div class="card"><div class="num">${d.summary.agRecheck || 0}</div><div class="lbl">À re-confirmer</div></div>
      ${bar(m.overallDevPct, 'Progression dev')}
      ${bar(agPct, 'Validation Armand', 'ag')}
    </div>
    <div class="filters" role="toolbar" aria-label="Filtres">
      ${filters.map(([k, lbl]) => `<button type="button" class="btn btn-sm filter-btn${state.filter === k ? ' active' : ''}" data-filter="${k}">${lbl}</button>`).join('')}
    </div>`

  for (const j of d.jalons) {
    const agV = j.stats?.agValidated ?? j.items.filter((i) => i.ag === 'validated').length
    const devReady = j.items.filter((i) => i.dev === 'done' && i.ag !== 'validated').length
    html += `<section class="block" id="jalon-${j.id}">
      <div class="block-head">
        <div>
          <h2>Jalon ${j.id} — ${esc(j.label)}</h2>
          <p>Objectif ${j.targetDate} · ${j.contractPct}% contrat · dev ${j.stats.devPct}%</p>
          <div class="jalon-progress">Validé Armand : <strong>${agV}/${j.items.length}</strong></div>
        </div>
        ${devReady && hasWriteAccess() ? `<button type="button" class="btn btn-sm btn-ok bulk-validate" data-jalon="${j.id}">✓ Valider tout le jalon (dev fait, ${devReady})</button>` : ''}
      </div>
      <div class="item-list">`
    for (const i of j.items) html += renderItemRow(i)
    html += '</div></section>'
  }

  html += `<section class="block warn" id="fichiers">
    <div class="block-head"><div><h2>Fichiers & infos manquantes</h2><p>Réponses Armand enregistrées comme les autres lignes.</p></div></div>
    <div class="item-list">`
  for (const f of d.files) html += renderItemRow({ ...f, neededToFinish: f.devNote })
  html += `</div></section>
    <section class="block agenda"><h2 style="margin:0 0 10px;font-size:16px;padding:16px 16px 0">Priorités du jour</h2>
    <div style="padding:0 16px 16px"><ol>`
  for (const line of d.agenda) html += `<li>${esc(line)}</li>`
  html += `</ol><p class="note">Objectif : clôturer au moins <strong>jalon C</strong> (100% dev) et <strong>jalon A</strong> (lignes dev fait). Contact : <a href="mailto:${esc(m.contact)}">${esc(m.contact)}</a></p></div></section>
    <footer>devis.zerux.com — validation Partie 2</footer>`

  document.getElementById('app').innerHTML = html
  bindEvents()
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api/validation${path}`, { ...options, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || res.statusText)
  return body
}

async function load() {
  state.data = await api('/roadmap')
  render()
}

async function saveItem(itemId, panel) {
  const statusBtn = panel.querySelector('.ag-btns .active')
  if (!statusBtn) {
    const statusEl = panel.querySelector('.save-status')
    statusEl.textContent = 'Choisissez un statut (Validé, Retour, …)'
    statusEl.classList.add('err')
    return
  }
  const ag_status = statusBtn.dataset.status
  const ag_answer = panel.querySelector('[data-field="ag_answer"]')?.value?.trim() || null
  const ag_comment = panel.querySelector('[data-field="ag_comment"]')?.value?.trim() || null
  const statusEl = panel.querySelector('.save-status')
  statusEl.textContent = 'Enregistrement…'
  statusEl.classList.remove('err')
  try {
    await api(`/feedback/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ ag_status, ag_answer, ag_comment, respondent_name: respondentName() }),
    })
    statusEl.textContent = '✓ Enregistré'
    await load()
  } catch (err) {
    statusEl.textContent = err.message
    statusEl.classList.add('err')
    if (err.message.includes('Connexion')) {
      if (confirm('Connexion requise. Ouvrir la page de login ?')) location.href = '/login'
    }
  }
}

async function bulkValidate(jalonId) {
  if (!confirm(`Marquer comme « Validé AG » toutes les lignes « dev fait » du jalon ${jalonId} ?`)) return
  try {
    await api('/feedback/bulk', {
      method: 'POST',
      body: JSON.stringify({ jalonId, ag_status: 'validated', onlyDevDone: true, respondent_name: respondentName() }),
    })
    await load()
  } catch (err) {
    alert(err.message)
    if (err.message.includes('Connexion') && confirm('Connexion requise. Ouvrir la page de login ?')) {
      location.href = '/login'
    }
  }
}

async function publishDevFix(itemId, panel) {
  const dev_response = panel.querySelector('.dev-response-input')?.value?.trim()
  if (!dev_response) {
    alert('Décrivez la correction')
    return
  }
  try {
    await api(`/feedback/${itemId}/dev-fix`, {
      method: 'PUT',
      body: JSON.stringify({ dev_response, respondent_name: respondentName() }),
    })
    await load()
  } catch (err) {
    alert(err.message)
  }
}

async function bulkPublishDevFixes() {
  if (!confirm('Publier les corrections déployées et demander re-validation à Armand ?')) return
  try {
    const res = await api('/feedback/bulk-dev-fix', {
      method: 'POST',
      body: JSON.stringify({ respondent_name: respondentName() }),
    })
    alert(`${res.count || 0} point(s) en « à re-confirmer »`)
    await load()
  } catch (err) {
    alert(err.message)
  }
}

function bindEvents() {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter
      render()
    })
  })

  document.querySelectorAll('.ag-btns button[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.ag-panel')
      panel.querySelectorAll('.ag-btns button').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  document.querySelectorAll('.save-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.ag-panel')
      saveItem(panel.dataset.itemId, panel)
    })
  })

  document.querySelectorAll('.bulk-validate').forEach((btn) => {
    btn.addEventListener('click', () => bulkValidate(btn.dataset.jalon))
  })

  document.querySelectorAll('.publish-dev-fix').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.dev-panel')
      publishDevFix(panel.dataset.itemId, panel)
    })
  })

  const bulkDevBtn = document.getElementById('bulk-dev-fix')
  if (bulkDevBtn) bulkDevBtn.addEventListener('click', bulkPublishDevFixes)
}

async function boot() {
  try {
    await load()
  } catch (err) {
    if (String(err.message).includes('Connexion')) {
      location.href = '/login'
      return
    }
    document.getElementById('app').innerHTML = `<p class="loading">Erreur : ${esc(err.message)}. <a href="/suivi-armand">Vue app</a></p>`
  }
}

boot()
