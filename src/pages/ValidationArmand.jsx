import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, HelpCircle, Clock, AlertTriangle, Filter } from 'lucide-react'
import api from '../api/index.js'
import { useAuthStore } from '../store/useAuthStore.js'
import AgFeedbackPanel, { bulkValidateJalon } from '../components/validation/AgFeedbackPanel.jsx'
import DevResponsePanel, { bulkPublishDevFixes } from '../components/validation/DevResponsePanel.jsx'
import {
  ROADMAP_META,
  MEETING_AGENDA,
  jalonStats,
  allItems,
} from '../data/armandValidationRoadmap.js'
import { enrichItemWithGuide } from '../data/armandValidationGuide.js'
import {
  agActorLabel,
  agActionLabel,
  formatValidationDateTime,
  validationActorKind,
  VALIDATION_DEV_NAME,
} from '../lib/validationActivity.js'

const DEV_LABELS = {
  done: { text: 'Fait — à valider Armand', className: 'val-badge val-badge--done' },
  in_progress: { text: 'En cours', className: 'val-badge val-badge--progress' },
  waiting: { text: 'En attente (info)', className: 'val-badge val-badge--wait' },
  question: { text: 'Question', className: 'val-badge val-badge--question' },
}

const AG_LABELS = {
  pending: { text: 'À valider', className: 'val-badge val-badge--ag-pending' },
  validated: { text: 'Validé AG', className: 'val-badge val-badge--ag-ok' },
  return: { text: 'Retour / corrections', className: 'val-badge val-badge--ag-return' },
  recheck: { text: 'Corrigé — à re-confirmer', className: 'val-badge val-badge--recheck' },
  to_provide: { text: 'À fournir', className: 'val-badge val-badge--wait' },
}

function DevBadge({ status }) {
  const cfg = DEV_LABELS[status] || DEV_LABELS.in_progress
  return <span className={cfg.className}>{cfg.text}</span>
}

function AppLink({ item }) {
  if (!item.appLink) return <span className="val-note">—</span>
  return (
    <Link className="val-app-link" to={item.appLink} target="_blank" rel="noopener noreferrer">
      → {item.appLinkLabel || 'Ouvrir'}
    </Link>
  )
}

function VerifyDetails({ item }) {
  if (!item.verifySteps?.length && !item.verifyCmd) return null
  return (
    <details className="val-verify-details" open>
      <summary>Comment vérifier</summary>
      {item.appLink && (
        <p className="val-verify-link">
          Page à ouvrir : <Link to={item.appLink} target="_blank" rel="noopener noreferrer">{item.appLinkLabel || item.appLink}</Link>
        </p>
      )}
      <ol className="val-verify-list">
        {(item.verifySteps || []).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {item.verifyCmd && <pre className="val-verify-cmd"><code>{item.verifyCmd}</code></pre>}
    </details>
  )
}

function enrich(item) {
  return enrichItemWithGuide(item)
}

function AgBadge({ status }) {
  const cfg = AG_LABELS[status] || AG_LABELS.pending
  return <span className={cfg.className}>{cfg.text}</span>
}

function FeedbackThread({ item }) {
  const hasArmand = Boolean(item.agNote || item.agAnswer)
  const hasDev = Boolean(item.devResponse)
  const agWhen = formatValidationDateTime(item.agFeedbackAt || item.agUpdatedAt)
  const devWhen = formatValidationDateTime(item.devResponseAt)
  const agWho = agActorLabel(item.agUpdatedBy)
  if (!hasArmand && !hasDev && item.ag !== 'recheck') return null
  return (
    <div className="val-thread">
      {hasArmand && (
        <div className="val-thread-block val-thread-block--armand">
          <div className="val-thread-label">
            Retour {validationActorKind(item.agUpdatedBy) === 'arthur' ? 'Arthur' : 'Armand / client'}
            {item.ag !== 'pending' && (
              <span className="val-thread-action"> · {agActionLabel(item.ag)}</span>
            )}
          </div>
          {item.agAnswer && <p className="val-thread-text">{item.agAnswer}</p>}
          {item.agNote && <p className="val-thread-text">{item.agNote}</p>}
          {agWhen && (
            <div className="val-thread-meta">
              {agWhen}
              {item.agUpdatedBy ? ` — ${agWho}` : ''}
            </div>
          )}
        </div>
      )}
      {hasDev && (
        <div className="val-thread-block val-thread-block--dev">
          <div className="val-thread-label">Correction déployée — Xavier</div>
          <p className="val-thread-text">{item.devResponse}</p>
          {devWhen && (
            <div className="val-thread-meta">
              {devWhen}
              {item.devResponseBy ? ` — ${agActorLabel(item.devResponseBy)}` : ''}
            </div>
          )}
        </div>
      )}
      {item.ag === 'recheck' && (
        <div className="val-thread-banner">
          Merci de re-tester puis cliquer <strong>Validé</strong> ou <strong>Retour</strong> ci-dessous.
        </div>
      )}
    </div>
  )
}

function cardActivityLines(item = {}) {
  const lines = []
  const agAt = item.agFeedbackAt
    || (item.ag !== 'pending' && validationActorKind(item.agUpdatedBy) !== 'dev' ? item.agUpdatedAt : null)
  if (agAt && (item.ag !== 'pending' || item.agNote || item.agAnswer)) {
    lines.push({
      kind: 'client',
      at: agAt,
      who: agActorLabel(item.agUpdatedBy),
      action: item.ag !== 'pending' ? agActionLabel(item.ag) : null,
    })
  }
  if (item.devResponseAt) {
    lines.push({
      kind: 'dev',
      at: item.devResponseAt,
      who: agActorLabel(item.devResponseBy || VALIDATION_DEV_NAME),
      action: 'Correction publiée',
    })
  }
  return lines
}

function CardActivityDates({ item }) {
  const lines = cardActivityLines(item)
  if (!lines.length) return null
  return (
    <div className="val-item-dates" aria-label="Historique des actions sur ce point">
      {lines.map((line) => (
        <span key={`${line.kind}-${line.at}`} className={`val-item-date val-item-date--${line.kind}`}>
          <time dateTime={line.at}>{formatValidationDateTime(line.at)}</time>
          {' · '}
          {line.who}
          {line.action ? ` · ${line.action}` : ''}
        </span>
      ))}
    </div>
  )
}

function ValidationItemCard({ item, onSaved }) {
  return (
    <article className={`val-item-card${item.question ? ' val-item-card--open' : ''}${item.ag === 'return' ? ' val-item-card--return' : ''}${item.ag === 'recheck' ? ' val-item-card--recheck' : ''}${item.ag === 'validated' ? ' val-item-card--validated' : ''}`}>
      <div className="val-item-main">
        <div className="val-item-title-row">
          <span className="val-id">{item.id}</span>
          <h3>{item.label}</h3>
        </div>
        <div className="val-item-badges">
          <DevBadge status={item.dev} />
          <AgBadge status={item.ag} />
        </div>
        <CardActivityDates item={item} />
        <div className="val-item-meta">
          <AppLink item={item} />
        </div>
        {(item.devNote || item.neededToFinish) && (
          <div className="val-item-notes">
            {item.devNote && <p>{item.devNote}</p>}
            {item.neededToFinish && <p className="val-question-need">À confirmer : {item.neededToFinish}</p>}
          </div>
        )}
        <VerifyDetails item={item} />
        <FeedbackThread item={item} />
      </div>
      <div className="val-item-feedback">
        <DevResponsePanel item={item} onSaved={onSaved} />
        <AgFeedbackPanel item={item} onSaved={onSaved} />
      </div>
    </article>
  )
}

function ProgressBar({ pct, label }) {
  return (
    <div className="val-progress">
      <div className="val-progress-head">
        <span>{label}</span>
        <strong>{pct}%</strong>
      </div>
      <div className="val-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="val-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function ValidationArmand() {
  const { user } = useAuthStore()
  const [filter, setFilter] = useState('all')
  const [roadmap, setRoadmap] = useState(null)
  const [loadError, setLoadError] = useState('')

  const loadRoadmap = useCallback(async () => {
    if (!user) {
      setLoadError('Connectez-vous pour accéder au suivi validation.')
      setRoadmap(null)
      return
    }
    setLoadError('')
    try {
      const data = await api.get('/validation/roadmap')
      setRoadmap(data)
    } catch (err) {
      setLoadError(err?.error || err?.message || 'Chargement impossible')
      setRoadmap(null)
    }
  }, [user])

  useEffect(() => {
    loadRoadmap()
  }, [loadRoadmap])

  const jalons = useMemo(
    () => (roadmap?.jalons || []).map((j) => ({
      ...j,
      items: j.items.map(enrich),
    })),
    [roadmap]
  )
  const files = useMemo(
    () => (roadmap?.files || []).map(enrich),
    [roadmap]
  )

  const summary = useMemo(() => {
    if (roadmap?.summary) {
      const items = [...jalons.flatMap((j) => j.items), ...files]
      return {
        done: items.filter((i) => i.dev === 'done').length,
        inProgress: items.filter((i) => i.dev === 'in_progress').length,
        blocked: items.filter((i) => i.dev === 'waiting' || i.dev === 'question').length,
        agValidated: roadmap.summary.agValidated,
        agRecheck: roadmap.summary.agRecheck ?? 0,
        total: roadmap.summary.total,
      }
    }
    const items = allItems()
    return {
      done: items.filter((i) => i.dev === 'done').length,
      inProgress: items.filter((i) => i.dev === 'in_progress').length,
      blocked: items.filter((i) => i.dev === 'waiting' || i.dev === 'question').length,
      agValidated: 0,
      agRecheck: 0,
      total: items.length,
    }
  }, [roadmap, jalons, files])

  const matchesFilter = (item) => {
    if (filter === 'all') return true
    if (filter === 'done') return item.dev === 'done'
    if (filter === 'in_progress') return item.dev === 'in_progress'
    if (filter === 'blocked') return item.dev === 'waiting' || item.dev === 'question'
    if (filter === 'ag_pending') return item.ag === 'pending' || item.ag === 'to_provide'
    if (filter === 'ag_recheck') return item.ag === 'recheck'
    if (filter === 'ag_return') return item.ag === 'return' || item.ag === 'question'
    return true
  }

  const onBulkPublishFixes = async () => {
    if (!user) return
    if (!window.confirm('Publier les corrections déployées (A7, A9, A10, A5, A1, B4, B5, C2) et demander re-validation à Armand ?')) return
    try {
      const res = await bulkPublishDevFixes(user)
      await loadRoadmap()
      window.alert(`${res?.count ?? 0} point(s) passé(s) en « Corrigé — à re-confirmer ».`)
    } catch (err) {
      window.alert(err?.error || err?.message || 'Erreur')
    }
  }

  const onBulkValidate = async (jalonId) => {
    if (!user) return
    if (!window.confirm(`Marquer comme « Validé » toutes les lignes « dev fait » du jalon ${jalonId} ?`)) return
    try {
      await bulkValidateJalon(jalonId, user)
      await loadRoadmap()
    } catch (err) {
      window.alert(err?.error || err?.message || 'Erreur')
    }
  }

  if (!user) {
    return (
      <div className="val-page val-page--standalone">
        <main className="val-main" style={{ padding: 48, textAlign: 'center' }}>
          <h1 className="val-title">Suivi validation — Partie 2</h1>
          <p className="val-note">Connexion requise (compte admin ou utilisateur Zerux).</p>
          <Link className="val-link-btn val-link-btn--primary" to="/login">Se connecter</Link>
        </main>
      </div>
    )
  }

  if (loadError && !roadmap) {
    return (
      <div className="val-page val-page--standalone">
        <main className="val-main" style={{ padding: 48, textAlign: 'center' }}>
          <p className="val-note">{loadError}</p>
          <button type="button" className="val-filter-btn" onClick={loadRoadmap}>Réessayer</button>
        </main>
      </div>
    )
  }

  return (
    <div className="val-page val-page--standalone">
      <main className="val-main">
        <header className="val-header">
          <div>
            <p className="val-eyebrow">Aide à la validation · Lot Armand</p>
            <h1 className="val-title">{ROADMAP_META.title}</h1>
            <p className="val-subtitle">
              {ROADMAP_META.project} — {ROADMAP_META.client}
              <span className="val-dot">·</span>
              MAJ {ROADMAP_META.updatedAt}
            </p>
          </div>
          <div className="val-header-actions">
            <span className="val-note">Connecté : {user.name || user.email}</span>
            <a className="val-link-btn" href="/validation/recette.md" target="_blank" rel="noopener noreferrer">
              Doc recette
            </a>
            <Link className="val-link-btn val-link-btn--primary" to="/devis">
              Ouvrir l&apos;app devis
            </Link>
            <button type="button" className="val-link-btn val-link-btn--dev" onClick={onBulkPublishFixes}>
              Publier corrections → re-validation
            </button>
          </div>
        </header>

        <section className="val-summary" aria-label="Synthèse">
          <div className="val-stat-card">
            <CheckCircle2 size={20} className="val-stat-icon val-stat-icon--done" />
            <div>
              <div className="val-stat-num">{summary.done}</div>
              <div className="val-stat-label">Prêt à valider</div>
            </div>
          </div>
          <div className="val-stat-card">
            <Clock size={20} className="val-stat-icon val-stat-icon--progress" />
            <div>
              <div className="val-stat-num">{summary.inProgress}</div>
              <div className="val-stat-label">En cours dev</div>
            </div>
          </div>
          <div className="val-stat-card">
            <HelpCircle size={20} className="val-stat-icon val-stat-icon--question" />
            <div>
              <div className="val-stat-num">{summary.blocked}</div>
              <div className="val-stat-label">Question / attente</div>
            </div>
          </div>
          <div className="val-stat-card">
            <Circle size={20} className="val-stat-icon val-stat-icon--ag" />
            <div>
              <div className="val-stat-num">{summary.agValidated}/{summary.total}</div>
              <div className="val-stat-label">Validé AG</div>
            </div>
          </div>
          <div className="val-stat-card">
            <AlertTriangle size={20} className="val-stat-icon val-stat-icon--recheck" />
            <div>
              <div className="val-stat-num">{summary.agRecheck ?? 0}</div>
              <div className="val-stat-label">Corrigé — à re-confirmer</div>
            </div>
          </div>
          <div className="val-stat-card val-stat-card--wide">
            <ProgressBar pct={ROADMAP_META.overallDevPct} label="Progression dev globale" />
          </div>
        </section>

        <section className="val-filters" aria-label="Filtres">
          <Filter size={16} aria-hidden />
          {[
            ['all', 'Tout'],
            ['done', 'À valider (dev fait)'],
            ['in_progress', 'En cours'],
            ['blocked', 'Bloqué / question'],
            ['ag_recheck', 'À re-confirmer (corrigé)'],
            ['ag_return', 'Retours Armand'],
            ['ag_pending', 'En attente Armand'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`val-filter-btn${filter === key ? ' val-filter-btn--active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </section>

        {jalons.map((jalon) => {
          const stats = jalon.stats || jalonStats(jalon)
          const visible = jalon.items.filter(matchesFilter)
          const devReady = jalon.items.filter((i) => i.dev === 'done' && i.ag !== 'validated').length
          if (filter !== 'all' && visible.length === 0) return null
          return (
            <section key={jalon.id} className="val-jalon" id={`jalon-${jalon.id}`}>
              <div className="val-jalon-head">
                <div>
                  <h2>
                    Jalon {jalon.id} — {jalon.label}
                  </h2>
                  <p>
                    Validation cible {jalon.targetDate} · {jalon.contractPct}% du contrat
                  </p>
                  <p className="val-note">
                    Validé : {stats.agValidated ?? jalon.items.filter((i) => i.ag === 'validated').length}/{jalon.items.length}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  {devReady > 0 && (
                    <button type="button" className="val-filter-btn val-filter-btn--active" onClick={() => onBulkValidate(jalon.id)}>
                      ✓ Valider tout le jalon (dev fait, {devReady})
                    </button>
                  )}
                  <ProgressBar pct={stats.devPct} label="Avancement dev" />
                </div>
              </div>
              <div className="val-item-list">
                {visible.map((item) => (
                  <ValidationItemCard key={item.id} item={item} onSaved={loadRoadmap} />
                ))}
              </div>
            </section>
          )
        })}

        <section className="val-jalon val-jalon--blockers" id="fichiers">
          <div className="val-jalon-head">
            <div>
              <h2>
                <AlertTriangle size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                Fichiers & infos manquantes (Zerux)
              </h2>
              <p>Bloquants côté client — sans réponse, certains points restent en attente.</p>
            </div>
          </div>
          <div className="val-item-list">
            {files.map((f) => (
              <ValidationItemCard key={f.id} item={f} onSaved={loadRoadmap} />
            ))}
          </div>
        </section>

        <section className="val-agenda">
          <h2>Ordre du jour — point validation</h2>
          <ol>
            {MEETING_AGENDA.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <p className="val-note">
            Contact : <a href={`mailto:${ROADMAP_META.contact}`}>{ROADMAP_META.contact}</a>
          </p>
        </section>
      </main>
    </div>
  )
}
