/**
 * Knowledge.jsx — Base de connaissances NEXUS consultable par les humains
 *
 * Objectif : rassurer les utilisateurs en leur montrant TOUT ce que l'agent IA
 * connaît (markdowns de règles + tableaux de prix + options + liens vers les
 * expériences commerciaux validées qui servent de points de contrôle).
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, FileText, Table2, Wrench, Shield, Settings, ArrowLeft,
  Search, ChevronRight, Info, CheckCircle2, Users, Database, AlertTriangle,
  Loader2,
} from 'lucide-react'
import { MarkdownRenderer } from '../components/MarkdownRenderer.jsx'
import AppSidebar from '../components/AppSidebar.jsx'
import AppBreadcrumbs from '../components/AppBreadcrumbs.jsx'
import { useAppBreadcrumbs } from '../hooks/useAppBreadcrumbs.js'
import api from '../api/index.js'

const CATEGORY_META = {
  process: { label: 'Méthodologie',  icon: Settings,  color: '#8b5cf6' },
  gamme:   { label: 'Gammes',        icon: Shield,    color: '#3b82f6' },
  equip:   { label: 'Équipements',   icon: Wrench,    color: '#10b981' },
  spec:    { label: 'Portes spéciales', icon: AlertTriangle, color: '#f59e0b' },
  autre:   { label: 'Autres',        icon: FileText,  color: 'var(--color-text-3)' },
}

const SECTION_LABELS = {
  overview: 'Vue d\'ensemble',
  docs: 'Documents métier',
  tables: 'Tableaux de prix',
  options: 'Options & équipements',
  process: 'Comment l\'IA s\'en sert',
  control: 'Points de contrôle humains',
}

export default function Knowledge() {
  const nav = useNavigate()
  const breadcrumbs = useAppBreadcrumbs()
  const [inventory, setInventory] = useState(null)
  const [tables, setTables] = useState(null)
  const [activeSection, setActiveSection] = useState('overview')
  const [activeDoc, setActiveDoc] = useState(null)
  const [docContent, setDocContent] = useState('')
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTable, setActiveTable] = useState(null)

  // ── Chargement initial ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [inv, tbl] = await Promise.all([
          api.get('/knowledge'),
          api.get('/knowledge/tables').catch(() => null),
        ])
        setInventory(inv)
        setTables(tbl)
        if (Array.isArray(tbl) && tbl.length > 0) {
          setActiveTable(tbl[0].id)
        } else if (tbl?.tables_prix) {
          setActiveTable(Object.keys(tbl.tables_prix)[0])
        }
      } catch (err) {
        console.error(err)
      }
    })()
  }, [])

  // ── Chargement d'un doc ────────────────────────────────────────────
  useEffect(() => {
    if (!activeDoc) return
    setLoadingDoc(true)
    api.get(`/knowledge/docs/${encodeURIComponent(activeDoc)}`)
      .then(r => setDocContent(r.content))
      .catch(() => setDocContent('❌ Erreur de chargement'))
      .finally(() => setLoadingDoc(false))
  }, [activeDoc])

  const docsByCat = useMemo(() => {
    if (!inventory?.docs) return {}
    const filter = search.trim().toLowerCase()
    const filtered = filter
      ? inventory.docs.filter(d =>
          d.label.toLowerCase().includes(filter) ||
          d.name.toLowerCase().includes(filter))
      : inventory.docs
    return filtered.reduce((acc, d) => {
      (acc[d.category] = acc[d.category] || []).push(d)
      return acc
    }, {})
  }, [inventory, search])

  if (!inventory) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--color-primary)' }} />
      </div>
    )
  }

  // ───────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell home-shell knowledge-shell">
      <AppSidebar />
      <div className="knowledge-workspace">
      {/* ── SIDEBAR NAV ── */}
      <aside style={{
        width: 280, flexShrink: 0, background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0,
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <AppBreadcrumbs items={breadcrumbs} compact />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <BookOpen size={20} color="var(--color-primary)" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Connaissance IA</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                Base documentaire NEXUS 2026
              </div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 6px' }}>
          {/* Sections principales */}
          {[
            { id: 'overview', label: 'Vue d\'ensemble', icon: Info },
            { id: 'process',  label: 'Comment l\'IA s\'en sert', icon: Settings },
            { id: 'control',  label: 'Points de contrôle humains', icon: Users },
          ].map(s => {
            const Icon = s.icon
            return (
              <button key={s.id}
                onClick={() => { setActiveSection(s.id); setActiveDoc(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '8px 12px', borderRadius: 8, border: 'none', background: activeSection === s.id && !activeDoc
                    ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                  color: activeSection === s.id && !activeDoc ? 'var(--color-primary)' : 'var(--color-text)',
                  fontSize: 13, fontWeight: activeSection === s.id && !activeDoc ? 600 : 500, cursor: 'pointer', marginBottom: 2,
                }}>
                <Icon size={14} /> {s.label}
              </button>
            )
          })}

          {/* Recherche docs */}
          <div style={{ padding: '12px 8px 6px', marginTop: 6, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Search size={12} color="var(--color-text-3)" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un document…"
                style={{
                  flex: 1, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)',
                  borderRadius: 6, padding: '5px 8px', fontSize: 11, color: 'var(--color-text)',
                }}
              />
            </div>
          </div>

          {/* Documents par catégorie */}
          {Object.entries(docsByCat).map(([cat, docs]) => {
            const meta = CATEGORY_META[cat] || CATEGORY_META.autre
            const Icon = meta.icon
            return (
              <div key={cat} style={{ marginTop: 8 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: meta.color,
                }}>
                  <Icon size={11} /> {meta.label} ({docs.length})
                </div>
                {docs.map(d => (
                  <button key={d.name}
                    onClick={() => { setActiveDoc(d.name); setActiveSection('doc'); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      padding: '5px 12px 5px 22px', borderRadius: 6, border: 'none',
                      background: activeDoc === d.name ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                      color: activeDoc === d.name ? 'var(--color-primary)' : 'var(--color-text)',
                      fontSize: 12, fontWeight: activeDoc === d.name ? 600 : 400, cursor: 'pointer',
                    }}>
                    <FileText size={10} style={{ opacity: 0.6 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.label}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--color-text-3)' }}>
                      {d.lines}l
                    </span>
                  </button>
                ))}
              </div>
            )
          })}

          {/* Tableaux de prix */}
          {(Array.isArray(tables) ? tables.length > 0 : tables?.tables_prix) && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
              <button onClick={() => { setActiveSection('tables'); setActiveDoc(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '8px 12px', borderRadius: 8, border: 'none',
                  background: activeSection === 'tables' ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                  color: activeSection === 'tables' ? 'var(--color-primary)' : 'var(--color-text)',
                  fontSize: 13, fontWeight: activeSection === 'tables' ? 600 : 500, cursor: 'pointer',
                }}>
                <Table2 size={14} /> Tableaux de prix ({Array.isArray(tables) ? tables.length : Object.keys(tables.tables_prix).length})
              </button>

              <button onClick={() => { setActiveSection('options'); setActiveDoc(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '8px 12px', borderRadius: 8, border: 'none',
                  background: activeSection === 'options' ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                  color: activeSection === 'options' ? 'var(--color-primary)' : 'var(--color-text)',
                  fontSize: 13, fontWeight: activeSection === 'options' ? 600 : 500, cursor: 'pointer',
                }}>
                <Wrench size={14} /> Options & équipements
              </button>
            </div>
          )}
        </nav>

        {/* Footer stats */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--color-border)', fontSize: 10, color: 'var(--color-text-3)' }}>
          <div>{inventory.totalDocs} documents · {(inventory.totalBytes / 1024).toFixed(0)} Ko</div>
          <div>{inventory.totalLines} lignes de règles métier</div>
          {tables && <div>{inventory.tables?.nbTables ?? 0} tableaux · {inventory.tables?.nbOptions ?? 0} options</div>}
        </div>
      </aside>

      {/* ── CONTENU PRINCIPAL ── */}
      <main style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', height: '100vh' }}>
        {activeDoc ? (
          <DocView name={activeDoc} label={inventory.docs.find(d => d.name === activeDoc)?.label} content={docContent} loading={loadingDoc} />
        ) : activeSection === 'overview' ? (
          <OverviewView inventory={inventory} nav={nav} />
        ) : activeSection === 'process' ? (
          <ProcessView inventory={inventory} />
        ) : activeSection === 'control' ? (
          <ControlView nav={nav} />
        ) : activeSection === 'tables' ? (
          <TablesView tables={tables} active={activeTable} setActive={setActiveTable} />
        ) : activeSection === 'options' ? (
          <OptionsView tables={tables} />
        ) : null}
      </main>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// VUES
// ═══════════════════════════════════════════════════════════════════════

function OverviewView({ inventory, nav }) {
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        Base de connaissance de l'agent IA
      </h1>
      <p style={{ color: 'var(--color-text-2)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
        Cette page liste <strong>toutes les règles métier NEXUS</strong> que Zerux IA
        connaît et utilise pour analyser les devis. Elle sert de source de vérité consultable
        par les humains pour s'assurer que les bonnes règles sont en place, et pour identifier
        ce qui manque ou ce qu'il faut corriger.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon={Database}  color="#3b82f6" label="Documents métier" value={inventory.totalDocs} sub={`${(inventory.totalBytes/1024).toFixed(0)} Ko · ${inventory.totalLines} lignes`} />
        <StatCard icon={Table2}    color="#8b5cf6" label="Tableaux de prix" value={inventory.tables?.nbTables ?? 0} sub={`${inventory.tables?.nbOptions ?? 0} options tarifaires`} />
        <StatCard icon={Wrench}    color="#10b981" label="Serrures & ferme-portes" value={(inventory.tables?.nbSerrures ?? 0) + (inventory.tables?.nbFermePortes ?? 0)} sub={`${inventory.tables?.nbSerrures ?? 0} serrures · ${inventory.tables?.nbFermePortes ?? 0} FP`} />
        <StatCard icon={Users}     color="#f59e0b" label="Expériences validées" value="—" sub="Voir module dédié" onClick={() => nav('/experiences')} />
      </div>

      <Section title="Sources de vérité">
        <ul style={{ paddingLeft: 18, lineHeight: 1.8, fontSize: 13, color: 'var(--color-text-2)' }}>
          <li><strong>Classeur TARIF NEXUS 2026-01.xlsx</strong> — 18 feuilles, mise à jour manuelle ;</li>
          <li><strong>17 fichiers markdown</strong> (ci-contre) — règles métier extraites et commentées ;</li>
          <li><strong>Expériences terrain approuvées</strong> — indexées dans Qdrant, injectées dans le prompt IA ;</li>
          <li><strong>Script <code>detect_nexus.py</code></strong> — pipeline de détection gamme/option + tables de prix.</li>
        </ul>
      </Section>

      <Section title="Ce que l'IA fait avec ces données">
        <ul style={{ paddingLeft: 18, lineHeight: 1.8, fontSize: 13, color: 'var(--color-text-2)' }}>
          <li>À chaque question posée dans le Devis, Zerux IA charge automatiquement : <code>GUIDE-DEVIS.md</code> (méthodo), <code>BASE.md</code> (catalogue), <code>EQUIP-COMMUN.md</code> (équipements), plus les markdowns de la gamme détectée ;</li>
          <li>Zerux IA utilise les <strong>tableaux de prix</strong> pour positionner une dimension dans la bonne fourchette (arrondi au plafond, cf. onglet "Tableaux") ;</li>
          <li>Zerux IA consulte les <strong>expériences commerciaux</strong> approuvées : les 3 à 8 plus pertinentes sont remontées selon la question (recherche sémantique) ;</li>
          <li>En cas de contradiction, la gamme principale prime — Zerux IA signale le conflit.</li>
        </ul>
      </Section>

      <div style={{
        padding: '14px 16px', marginTop: 20, borderRadius: 10,
        background: 'color-mix(in srgb, #f59e0b 10%, transparent)',
        border: '1px solid color-mix(in srgb, #f59e0b 40%, transparent)',
        fontSize: 13, display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Vous voyez une règle manquante, un prix obsolète, un cas non couvert ?</strong><br/>
          Ouvrez une <a onClick={() => nav('/experiences')} style={{ color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }}>expérience commerciale</a>.
          Une fois approuvée par un admin, elle sera injectée automatiquement dans le prompt Zerux IA à chaque devis pertinent.
        </div>
      </div>
    </div>
  )
}

function ProcessView({ inventory }) {
  const how = inventory.howItWorks || {}
  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Comment l'IA s'en sert</h1>
      <p style={{ color: 'var(--color-text-2)', fontSize: 13, marginBottom: 20 }}>
        Le raisonnement de Zerux IA n'est pas une boîte noire. Voici précisément ce qui se passe en coulisses.
      </p>

      <StepCard n="1" title="Détection automatique">
        Quand un fichier Excel est importé, le script <code>detect_nexus.py</code> lit chaque ligne et détecte :
        la gamme (CR3 à CR6, FB6-7, EI60/120, Prison, Anti-bélier, Blast, EF2), le vantail, les options
        (coupe-feu, pare-balles, séisme, AEV, blast), la serrure et le ferme-porte demandés.
      </StepCard>
      <StepCard n="2" title="Sélection des documents à charger">
        Selon ce qui est détecté, Zerux IA reçoit dans son prompt un jeu de markdowns :
        la <strong>méthodologie</strong>, le <strong>catalogue de base</strong>, le <strong>markdown de la gamme</strong>,
        les <strong>équipements communs</strong>, plus les markdowns des options activées.
      </StepCard>
      <StepCard n="3" title="Positionnement dans les tableaux">
        <div style={{ lineHeight: 1.6 }}>{how.tables}</div>
      </StepCard>
      <StepCard n="4" title="Injection des expériences">
        <div style={{ lineHeight: 1.6 }}>{how.control}</div>
      </StepCard>
      <StepCard n="5" title="Réponse structurée">
        Zerux IA applique les règles de croisement (si deux markdowns se contredisent, la gamme principale prime),
        signale les alertes (incompatibilités, avis de chantier, dimensions hors catalogue), et répond en français
        professionnel avec la source de chaque chiffre.
      </StepCard>
    </div>
  )
}

function ControlView({ nav }) {
  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
        <Users size={22} style={{ verticalAlign: -3, marginRight: 8 }} />
        Points de contrôle humains
      </h1>
      <p style={{ color: 'var(--color-text-2)', fontSize: 13, marginBottom: 20, lineHeight: 1.7 }}>
        L'agent IA n'est jamais seul : chaque règle métier qu'il applique doit pouvoir être
        contrôlée, corrigée ou enrichie par un humain. Voici les leviers disponibles.
      </p>

      <Section title="Module Expériences commerciaux" icon={Users}>
        <p style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.7 }}>
          Les commerciaux et admins peuvent créer des notes typées (chiffrage, piège à éviter,
          règle métier, attention client, matériaux, main d'œuvre, déplacement). Chaque note suit
          un cycle <strong>brouillon → en attente → approuvée ou refusée</strong>. Seules les notes
          <strong> approuvées par un admin</strong> sont injectées dans le prompt de Zerux IA.
        </p>
        <button onClick={() => nav('/experiences')} style={btnPrimary}>
          Ouvrir le module Expériences <ChevronRight size={14} />
        </button>
      </Section>

      <Section title="Que vérifier régulièrement">
        <ul style={{ paddingLeft: 18, lineHeight: 1.8, fontSize: 13, color: 'var(--color-text-2)' }}>
          <li><strong>Les tableaux de prix</strong> (onglet dédié) : prix HT de chaque (hauteur × largeur) par gamme — doivent refléter le classeur <code>TARIF NEXUS 2026-01.xlsx</code> ;</li>
          <li><strong>Les options tarifaires</strong> : EI60/EI120, FB4/FB6/FB7, séisme, AEV, blast — vérifier les montants unitaires ;</li>
          <li><strong>Les règles d'incompatibilité</strong> : FB7+coupe-feu, CR6+EI120, dimensions hors catalogue — listées dans le markdown de chaque gamme ;</li>
          <li><strong>Les serrures et ferme-portes</strong> : références et prix — mis à jour dans <code>EQUIP-COMMUN.md</code> ;</li>
          <li><strong>Les expériences en attente</strong> : les admins doivent les modérer régulièrement pour qu'elles entrent dans la boucle IA.</li>
        </ul>
      </Section>

      <Section title="Qui peut faire quoi ?">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--color-surface-2, rgba(0,0,0,0.04))' }}>
              <th style={thStyle}>Action</th><th style={thStyle}>Commercial</th><th style={thStyle}>Admin</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={tdStyle}>Consulter cette page</td><td style={tdStyle}>✓</td><td style={tdStyle}>✓</td></tr>
            <tr><td style={tdStyle}>Créer une expérience</td><td style={tdStyle}>✓</td><td style={tdStyle}>✓</td></tr>
            <tr><td style={tdStyle}>Éditer sa propre expérience (pending)</td><td style={tdStyle}>✓</td><td style={tdStyle}>✓</td></tr>
            <tr><td style={tdStyle}>Approuver / refuser</td><td style={tdStyle}>—</td><td style={tdStyle}>✓</td></tr>
            <tr><td style={tdStyle}>Modifier les markdowns de règles</td><td style={tdStyle}>—</td><td style={tdStyle}>✓ (fichiers système)</td></tr>
            <tr><td style={tdStyle}>Mettre à jour les tableaux de prix</td><td style={tdStyle}>—</td><td style={tdStyle}>✓ (via detect_nexus.py)</td></tr>
          </tbody>
        </table>
      </Section>
    </div>
  )
}

function DocView({ name, label, content, loading }) {
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4 }}>
        Base documentaire · {name}
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{label || name}</h1>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-3)' }}>
          <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
          Chargement…
        </div>
      ) : (
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 10, padding: '20px 26px', fontSize: 13, lineHeight: 1.65,
        }}>
          <MarkdownRenderer content={content} />
        </div>
      )}
    </div>
  )
}

function TablesView({ tables, active, setActive }) {
  // Support nouveau format (array) et ancien format (objet tables_prix)
  const isNewFormat = Array.isArray(tables)
  if (!isNewFormat && !tables?.tables_prix) return <div>Tableaux indisponibles.</div>

  const tabs   = isNewFormat ? tables : Object.entries(tables.tables_prix).map(([id, t]) => ({ id, gamme: t.gamme, vantaux: t.vantail === '2V' ? 2 : 1, grid: {} }))
  const active_tab = tabs.find(t => t.id === active) ?? tabs[0]

  // Construire hauteurs/largeurs triées depuis grid {H: {L: {ref, prix}}}
  let hauteurs = [], largeurs = []
  if (active_tab) {
    const g = active_tab.grid
    hauteurs = Object.keys(g).map(Number).sort((a, b) => b - a) // décroissant
    const lSet = new Set()
    Object.values(g).forEach(row => Object.keys(row).forEach(l => lSet.add(Number(l))))
    largeurs = [...lSet].sort((a, b) => a - b)
  }

  // Couleurs style Excel bleu
  const BG_HEADER = '#1e3a5f'
  const BG_ROW_ODD  = '#2d5a8e'
  const BG_ROW_EVEN = '#1e4a7a'
  const BG_CELL_ODD  = '#e8f0fb'
  const BG_CELL_EVEN = '#d0e2f7'
  const TEXT_HEADER = '#ffffff'
  const TEXT_REF    = '#1e3a5f'
  const TEXT_PRIX   = '#0d2140'

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Tableaux de prix NEXUS</h1>
      <p style={{ color: 'var(--color-text-2)', fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
        <strong>Comment l'IA lit ces tableaux :</strong> pour une dimension demandée, elle prend
        la <strong>plus petite hauteur du tableau ≥ à la hauteur demandée</strong> (arrondi au plafond),
        puis la plus petite largeur ≥ à la largeur demandée. Le prix est à l'intersection.
      </p>

      {/* Sélecteur de gamme */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)} style={{
            padding: '5px 12px', borderRadius: 16, border: '1px solid #1e3a5f',
            background: active === t.id ? '#1e3a5f' : 'transparent',
            color: active === t.id ? '#fff' : '#1e3a5f',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {t.gamme} · {t.vantaux === 2 ? '2V' : '1V'}
          </button>
        ))}
      </div>

      {active_tab && (
        <div style={{ borderRadius: 10, overflow: 'auto', boxShadow: '0 2px 12px rgba(30,58,95,0.15)' }}>
          {/* Titre du tableau */}
          <div style={{ background: BG_HEADER, color: TEXT_HEADER, padding: '10px 16px', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
            TARIF BLOCS-PORTES NEXUS — {active_tab.gamme} · {active_tab.vantaux === 2 ? '2 VANTAUX' : '1 VANTAIL'} ·&nbsp;
            <span style={{ fontWeight: 400, opacity: 0.85 }}>{hauteurs.length} hauteurs × {largeurs.length} largeurs · prix HT TG en €</span>
          </div>

          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 'max-content' }}>
            <thead>
              <tr>
                <th style={{ background: BG_HEADER, color: TEXT_HEADER, padding: '8px 14px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 2 }}>
                  H ↓ / L →
                </th>
                {largeurs.map((l, li) => (
                  <th key={l} style={{
                    background: li % 2 === 0 ? '#234d82' : '#1e4474',
                    color: TEXT_HEADER, padding: '8px 14px', textAlign: 'center',
                    fontWeight: 700, whiteSpace: 'nowrap', minWidth: 110,
                  }}>
                    {l} mm
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hauteurs.map((h, hi) => {
                const rowBg = hi % 2 === 0 ? BG_ROW_ODD : BG_ROW_EVEN
                return (
                  <tr key={h}>
                    <th style={{
                      background: rowBg, color: TEXT_HEADER,
                      padding: '6px 14px', textAlign: 'center', fontWeight: 700,
                      whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1,
                    }}>
                      {h} mm
                    </th>
                    {largeurs.map((l, li) => {
                      const cell = active_tab.grid[String(h)]?.[String(l)]
                      const cellBg = li % 2 === 0 ? BG_CELL_ODD : BG_CELL_EVEN
                      return (
                        <td key={l} style={{ background: cellBg, padding: '4px 8px', textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid #b8d0ee' }}>
                          {cell ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: TEXT_REF, letterSpacing: 0.3, fontFamily: 'monospace' }}>{cell.ref}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIX, fontVariantNumeric: 'tabular-nums' }}>
                                {cell.prix.toLocaleString('fr-FR')} €
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#9fb8d8', fontSize: 11 }}>—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function OptionsView({ tables }) {
  if (!tables) return <div>Données indisponibles.</div>
  const opt = tables.options_ht || {}
  const serrures = tables.serrures || []
  const fp = tables.ferme_portes || []
  const dim = tables.dimensions_standard || {}

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Options tarifaires & équipements</h1>

      <Section title="Dimensions standard">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <MiniCard title="Hauteurs (mm)"    list={dim.hauteurs_mm} />
          <MiniCard title="Largeurs 1V (mm)" list={dim.largeurs_1V_mm} />
          <MiniCard title="Largeurs 2V (mm)" list={dim.largeurs_2V_mm} />
        </div>
      </Section>

      <Section title={`Options (${Object.keys(opt).length})`}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--color-surface-2, rgba(0,0,0,0.04))' }}>
            <th style={thStyle}>Code</th><th style={thStyle}>Prix HT TG</th>
          </tr></thead>
          <tbody>
            {Object.entries(opt).map(([k, v]) => (
              <tr key={k}>
                <td style={tdStyle}><code>{k}</code></td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString('fr-FR')} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Serrures (${serrures.length})`}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--color-surface-2, rgba(0,0,0,0.04))' }}>
            <th style={thStyle}>Mot-clé</th><th style={thStyle}>Référence</th><th style={thStyle}>Doc source</th>
          </tr></thead>
          <tbody>
            {serrures.map((s, i) => (
              <tr key={i}>
                <td style={tdStyle}><code>{s.keyword}</code></td>
                <td style={tdStyle}>{s.ref}</td>
                <td style={tdStyle}><code style={{ fontSize: 10 }}>{s.doc || '—'}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Ferme-portes (${fp.length})`}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--color-surface-2, rgba(0,0,0,0.04))' }}>
            <th style={thStyle}>Mot-clé</th><th style={thStyle}>Référence</th><th style={thStyle}>Doc source</th>
          </tr></thead>
          <tbody>
            {fp.map((f, i) => (
              <tr key={i}>
                <td style={tdStyle}><code>{f.keyword}</code></td>
                <td style={tdStyle}>{f.ref}</td>
                <td style={tdStyle}><code style={{ fontSize: 10 }}>{f.doc || '—'}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// PETITS COMPOSANTS
// ═══════════════════════════════════════════════════════════════════════

function StatCard({ icon: Icon, color, label, value, sub, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: 16, borderRadius: 10, background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
        <Icon size={14} /> {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={15} color="var(--color-primary)" />}
        {title}
      </h2>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 18px' }}>
        {children}
      </div>
    </section>
  )
}

function StepCard({ n, title, children }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 14, padding: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10 }}>
      <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
        {n}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

function MiniCard({ title, list }) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-3)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, fontFamily: 'monospace', lineHeight: 1.5 }}>
        {(list || []).join(' · ')}
      </div>
    </div>
  )
}

const thStyle = {
  padding: '8px 10px', fontWeight: 700, textAlign: 'center',
  borderBottom: '1px solid var(--color-border)', fontSize: 11,
  color: 'var(--color-text-2)', textTransform: 'uppercase', letterSpacing: '0.04em',
}
const tdStyle = {
  padding: '7px 10px', borderBottom: '1px solid var(--color-border)',
  fontSize: 12, color: 'var(--color-text)',
}
const btnPrimary = {
  marginTop: 10, padding: '8px 14px', borderRadius: 8, border: 'none',
  background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
}
