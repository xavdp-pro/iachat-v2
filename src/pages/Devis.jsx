/**
 * Devis.jsx — Page de génération de devis NEXUS
 * Layout 3 colonnes : Fichiers | Devis | Chat Gemma
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileSpreadsheet, Loader2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight,
  AlertTriangle, Bot, Send, X, FileText, Printer, Copy,
  Check, Info, Euro, Shield,
  Wrench, Package, Sparkles, RefreshCw, Plus, Trash2,
  MessageCircleReply, Clock, FolderOpen, LayoutGrid, LayoutPanelLeft, PanelBottom,
  Mic, MicOff,
} from 'lucide-react'
import { MarkdownRenderer } from '../components/MarkdownRenderer.jsx'
import api from '../api/index.js'

// ── Palette par gamme ────────────────────────────────────────────────────────
const GAMME_COLORS = {
  BASE:  '#64748b', CR3:  '#0ea5e9', CR4:  '#2563eb', CR5:  '#4f46e5',
  CR6:   '#7c3aed', EI60: '#d97706', EI120:'#c2410c', FB6:  '#dc2626',
  FB7:   '#7f1d1d', ANTI: '#374151', PRISON:'#111827',
}
const gammeColor = (g = '') => {
  const upper = g.toUpperCase()
  return GAMME_COLORS[Object.keys(GAMME_COLORS).find(k => upper.includes(k))] ?? '#354346'
}

const SUGGESTIONS = [
  'Vérifier la gamme et les dimensions',
  'Lister toutes les options disponibles',
  'Vérifier la cohérence des équipements',
  'Quelles sont les alertes importantes ?',
  'Génère une ligne de devis formatée',
  'Quel est le délai de pose estimé ?',
]

const prixFmt = (v) => v != null ? `${v.toLocaleString('fr-FR')} €` : null

// Layout persistence (Devis workspace)
const UI_KEY = {
  leftCollapsed: 'devis_ui_left_collapsed',
  assistantDock: 'devis_ui_assistant_dock',
  rightWidth: 'devis_ui_right_width',
  bottomHeight: 'devis_ui_bottom_height',
}
const RIGHT_W_MIN = 300
const RIGHT_W_MAX = 920
const BOTTOM_H_MIN = 220
const BOTTOM_H_MAX = 720
const LEFT_W = 260
const LEFT_COLLAPSED_W = 44

function GammeBadge({ gamme, vantail }) {
  const color = gammeColor(gamme)
  const label = gamme?.length > 20
    ? gamme.replace('⚠️ ', '').replace(' — hors catalogue', '…')
    : gamme
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: '6px',
      padding: '2px 7px', fontSize: '10px', fontWeight: 700,
      letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {label} · {vantail}
    </span>
  )
}

function Cell({ icon, label, value, highlight }) {
  return (
    <div style={{
      background: highlight ? 'rgba(53,67,70,0.06)' : 'var(--color-surface-2, rgba(0,0,0,0.03))',
      borderRadius: '8px', padding: '7px 10px',
      border: highlight ? '1px solid var(--color-border-strong,var(--color-border))' : '1px solid transparent',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--color-text-3, var(--color-text-2))', display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '12px', fontWeight: highlight ? 700 : 500, color: 'var(--color-text)', wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  )
}

// ── Ligne de résultat (compact pour la colonne centre) ─────────────────────
function RowCard({ row, index, active, expanded, onToggle, onSelect }) {
  const hasAlerts = row.alertes?.length > 0
  const alertColor = row.alertes?.some(a => a.startsWith('❌')) ? '#a33c3c' : '#a06a2c'

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
      borderRadius: '10px',
      overflow: 'hidden',
      transition: 'border-color 0.15s',
      cursor: 'pointer',
    }}
    onClick={() => onSelect()}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 12px',
          background: active ? 'color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))' : 'transparent',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--color-text-3)', fontWeight: 700, minWidth: '18px' }}>
          #{index + 1}
        </span>
        <GammeBadge gamme={row.gamme} vantail={row.vantail} />
        <span style={{ fontSize: '12px', color: 'var(--color-text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.type}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>
          H{row.dim_standard?.h ?? '?'} × L{row.dim_standard?.l ?? '?'}
        </span>
        {row.prix_base_ht != null && (
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
            {prixFmt(row.prix_total_min_ht ?? row.prix_base_ht)} HT
          </span>
        )}
        {hasAlerts && <AlertTriangle size={13} color={alertColor} />}
        <button onClick={(e) => { e.stopPropagation(); onToggle() }} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--color-text-3)' }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <hr style={{ margin: 0, border: 'none', borderTop: '1px solid var(--color-border)' }} />

          {hasAlerts && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {row.alertes.map((a, i) => (
                <div key={i} style={{
                  fontSize: '11px', padding: '4px 8px', borderRadius: '5px',
                  background: a.startsWith('❌') ? 'rgba(163,60,60,0.08)' : 'rgba(160,106,44,0.08)',
                  color: a.startsWith('❌') ? '#a33c3c' : '#a06a2c',
                  borderLeft: `3px solid ${a.startsWith('❌') ? '#a33c3c' : '#a06a2c'}`,
                }}>
                  {a}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <Cell icon={<Package size={11} />} label="Prix base" value={prixFmt(row.prix_base_ht) ?? '→ hors catalogue'} />
            {row.options?.length > 0 && (
              <Cell icon={<Euro size={11} />} label="Options" value={
                row.options.map(o => `${o.label}${o.prix != null ? ` +${o.prix.toLocaleString('fr-FR')}€` : ''}`).join(' · ')
              } />
            )}
            {row.prix_total_min_ht != null && (
              <Cell icon={<Euro size={11} />} label="Total estimé" value={prixFmt(row.prix_total_min_ht) + ' HT'} highlight />
            )}
            {row.serrure?.ref && <Cell icon={<Shield size={11} />} label="Serrure" value={row.serrure.ref} />}
            {row.ferme_porte?.ref && <Cell icon={<Wrench size={11} />} label="Ferme-porte" value={row.ferme_porte.ref} />}
            {(row.garnitures?.int || row.garnitures?.ext) && (
              <Cell icon={<Info size={11} />} label="Garnitures"
                value={[row.garnitures.int && `int: ${row.garnitures.int}`, row.garnitures.ext && `ext: ${row.garnitures.ext}`].filter(Boolean).join(' · ')}
              />
            )}
          </div>

          {row.equip_extra?.length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-2)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {row.equip_extra.map((e, i) => <span key={i}>🔧 {e}</span>)}
            </div>
          )}
          {row.autres && <div style={{ fontSize: '11px', color: 'var(--color-text-2)' }}>📎 {row.autres}</div>}
          <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>📄 {row.docs?.join(' → ')}</div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COLONNE GAUCHE : Fichiers sauvegardés (rétractable) ───────────────────
// ══════════════════════════════════════════════════════════════════════════════
function LeftPanel({
  collapsed,
  onToggleCollapse,
  sessions, activeId, onSelect, onNew, onDelete, dragging, onDragOver, onDragLeave, onDrop, fileInputRef, onFileChange,
}) {
  const w = collapsed ? LEFT_COLLAPSED_W : LEFT_W
  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".xlsx"
      style={{ display: 'none' }}
      onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) onFileChange(f)
        e.target.value = ''
      }}
    />
  )

  if (collapsed) {
    return (
      <div
        style={{
          width: w, minWidth: w, flexShrink: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', borderRight: '1px solid var(--color-border)',
          background: 'var(--color-surface)', height: '100%', overflow: 'hidden', paddingTop: 8, gap: 6,
        }}
      >
        {hiddenInput}
        <button type="button" title="Afficher le panneau fichiers" onClick={onToggleCollapse} style={iconBtn()}>
          <ChevronRight size={18} color="var(--color-primary)" />
        </button>
        <button type="button" title="Importer un .xlsx" onClick={() => fileInputRef.current?.click()} style={iconBtn()}>
          <Upload size={16} />
        </button>
        <button type="button" title="Nouveau devis" onClick={onNew} style={iconBtn()}>
          <Plus size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '9px', color: 'var(--color-text-3)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', paddingBottom: 8 }}>
          Fichiers
        </span>
      </div>
    )
  }

  return (
    <div style={{
      width: w, minWidth: w, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)',
      height: '100%', overflow: 'hidden',
    }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 10px', borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}
      >
        <button type="button" title="Réduire le panneau" onClick={onToggleCollapse} style={iconBtn()}>
          <ChevronLeft size={18} color="var(--color-text-3)" />
        </button>
        <FolderOpen size={16} color="var(--color-primary)" style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: '13px', flex: 1, minWidth: 0 }}>Fichiers</span>
        <button type="button" onClick={onNew} title="Nouveau devis" style={iconBtn()}>
          <Plus size={14} />
        </button>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          margin: '10px 10px 6px', padding: '14px 10px', textAlign: 'center',
          border: `2px dashed ${dragging ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
          color: 'var(--color-text-2)', transition: 'border-color 0.15s',
          background: dragging ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'transparent',
        }}
      >
        {hiddenInput}
        <Upload size={20} style={{ opacity: 0.5, marginBottom: 4 }} /><br />
        Glisser un .xlsx<br />
        <span style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>ou cliquer pour importer</span>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {sessions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--color-text-3)', fontSize: '12px' }}>
            Aucun fichier analysé
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
              marginBottom: 2,
              background: s.id === activeId ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))' : 'transparent',
              border: s.id === activeId ? '1px solid color-mix(in srgb, var(--color-primary) 25%, var(--color-border))' : '1px solid transparent',
              transition: 'background 0.1s',
            }}
          >
            <FileSpreadsheet size={14} color={s.id === activeId ? 'var(--color-primary)' : 'var(--color-text-3)'} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={9} /> {s.date} · {s.count} ligne{s.count !== 1 ? 's' : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(s.id) }}
              title="Supprimer"
              style={{ ...iconBtn(), opacity: 0.4 }}
              onMouseEnter={e => { e.currentTarget.style.opacity = 1 }}
              onMouseLeave={e => { e.currentTarget.style.opacity = 0.4 }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COLONNE DROITE : Chat Gemma ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function RightPanel({
  row, aiRow, aiMessages, aiInput, setAiInput, aiLoading, askAI, aiEndRef, aiInputRef, aiRecording, toggleAiMic, conseils, onAnalyzeConseils, onApplyConseil,
  /** 'right' = sidebar (panelWidth); 'bottom' = full width under center */
  layoutMode = 'right',
  panelWidth = 380,
}) {
  const [voletOpen, setVoletOpen] = useState(false)
  const dockBottom = layoutMode === 'bottom'

  const handleAnalyze = () => {
    if (!voletOpen) setVoletOpen(true)
    onAnalyzeConseils()
  }

  const toggleVolet = () => setVoletOpen(o => !o)

  return (
    <div style={{
      ...(dockBottom
        ? {
            width: '100%', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column',
            minHeight: 0, overflow: 'hidden',
          }
        : {
            width: panelWidth, minWidth: panelWidth, maxWidth: panelWidth, flexShrink: 0,
            display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
          }),
      borderLeft: dockBottom ? 'none' : '1px solid var(--color-border)',
      borderTop: dockBottom ? '1px solid var(--color-border)' : 'none',
      background: 'var(--color-surface)',
    }}
    >
      {/* ── Header ── */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <Bot size={16} color="var(--color-primary)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>Assistant Gemma</div>
          {row && (
            <div style={{ fontSize: '10px', color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Ligne {(aiRow ?? 0) + 1} — {row.gamme} {row.vantail} · {row.docs?.join(', ')}
            </div>
          )}
        </div>
        {/* Toggle volet conseils */}
        <button
          onClick={toggleVolet}
          title={voletOpen ? 'Masquer les conseils' : 'Afficher les conseils'}
          style={{
            ...iconBtn(),
            background: voletOpen ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
            color: voletOpen ? 'var(--color-primary)' : 'var(--color-text-3)',
            borderRadius: '8px', border: voletOpen ? '1px solid color-mix(in srgb, var(--color-primary) 30%, var(--color-border))' : '1px solid transparent',
          }}
        >
          <Sparkles size={14} />
        </button>
      </div>

      {/* ── VOLET CONSEILS (collapsible) ── */}
      <div style={{
        flexShrink: 0,
        maxHeight: voletOpen ? '260px' : '0px',
        overflow: 'hidden',
        transition: 'max-height 0.25s ease',
        borderBottom: voletOpen ? '1px solid var(--color-border)' : 'none',
      }}>
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Bouton analyse */}
          <button
            onClick={handleAnalyze}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 14px', borderRadius: '16px', border: '1px solid var(--color-primary)',
              background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Sparkles size={13} />
            Analyser avec conseils
          </button>

          {/* Liste des conseils (scrollable dans le volet) */}
          {conseils && conseils.length > 0 && (
            <div style={{ overflowY: 'auto', maxHeight: '170px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {conseils.map((c, i) => (
                <div key={i} style={{
                  background: 'var(--color-surface-2, rgba(53,67,70,0.04))',
                  border: '1px solid var(--color-border)', borderRadius: 8, padding: '7px 10px',
                  fontSize: '11px', color: 'var(--color-text)', display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <span style={{ flex: 1, lineHeight: 1.45 }}>
                    {c.label || c.titre || c.titre_action || c.action || c.conseil || c.resume || c.description}
                  </span>
                  {c.applicable && (
                    <button
                      onClick={() => onApplyConseil(c)}
                      style={{
                        flexShrink: 0, padding: '3px 9px', borderRadius: '12px',
                        border: '1px solid var(--color-primary)',
                        background: 'transparent', color: 'var(--color-primary)',
                        fontWeight: 700, fontSize: '10px', cursor: 'pointer',
                      }}
                    >
                      Appliquer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Résumé ligne (contexte) ── */}
      {row && (
        <div style={{
          padding: '6px 14px', background: 'var(--color-surface-2, rgba(53,67,70,0.04))',
          borderBottom: '1px solid var(--color-border)', fontSize: '11px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <GammeBadge gamme={row.gamme} vantail={row.vantail} />
          {row.dim_standard && <span style={{ color: 'var(--color-text-3)' }}>H{row.dim_standard.h}×L{row.dim_standard.l}</span>}
          {row.prix_base_ht != null && <span style={{ fontWeight: 600 }}>{prixFmt(row.prix_base_ht)}</span>}
          {row.prix_total_min_ht != null && row.prix_total_min_ht !== row.prix_base_ht && (
            <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>→ {prixFmt(row.prix_total_min_ht)}</span>
          )}
        </div>
      )}

      {/* ── CONSOLE : Suggestions + Messages ── */}
      {!row ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', color: 'var(--color-text-3)', textAlign: 'center', fontSize: '12px' }}>
          <div>
            <Bot size={32} style={{ opacity: 0.2, marginBottom: 8 }} /><br />
            Sélectionnez une ligne de devis<br />
            pour consulter l'assistant
          </div>
        </div>
      ) : (
        <>
          {/* Suggestions (si aucun message) */}
          {aiMessages.length === 0 && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', color: 'var(--color-text-3)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Suggestions
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => askAI(s)} style={{
                    padding: '4px 9px', borderRadius: '14px', border: '1px solid var(--color-border)',
                    background: 'transparent', color: 'var(--color-text)', fontSize: '11px',
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-input-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages — wider bubbles when assistant docked below for readable tables */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
            {aiMessages.map((m, i) => (
              <div key={i} style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--color-avatar-ai-bg, #e8ebea)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Bot size={12} color="var(--color-avatar-ai-text, var(--color-primary))" />
                  </div>
                )}
                <div style={{
                  flex: 1, padding: '8px 10px', borderRadius: '10px',
                  background: m.role === 'user'
                    ? 'var(--color-bubble-user, var(--color-primary))'
                    : 'var(--color-surface-2, var(--color-input-bg))',
                  color: m.role === 'user' ? '#fff' : 'var(--color-text)',
                  fontSize: '12px', lineHeight: 1.55,
                  marginLeft: m.role === 'user' ? 'auto' : 0,
                  maxWidth: dockBottom ? '100%' : '92%',
                  minWidth: 0,
                }}>
                  {m.role === 'assistant'
                    ? <MarkdownRenderer content={m.content} />
                    : m.content
                  }
                </div>
              </div>
            ))}

            {aiLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-3)', fontSize: '12px' }}>
                <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                Gemma réfléchit…
              </div>
            )}
            <div ref={aiEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid var(--color-border)',
            display: 'flex', gap: 6, flexShrink: 0,
          }}>
            <input
              ref={aiInputRef}
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), askAI())}
              placeholder={aiRecording ? 'Dictée en cours…' : 'Posez votre question…'}
              disabled={aiLoading}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: '8px',
                border: `1px solid ${aiRecording ? 'var(--color-danger)' : 'var(--color-border)'}`,
                background: 'var(--color-input-bg, var(--color-surface-2))',
                color: 'var(--color-text)', fontSize: '12px', outline: 'none',
                fontFamily: 'var(--font-body)',
              }}
            />
            <button
              onClick={toggleAiMic}
              title={aiRecording ? 'Arrêter la dictée' : 'Dicter'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '8px 10px', borderRadius: '8px',
                border: `1px solid ${aiRecording ? 'var(--color-danger)' : 'var(--color-border)'}`,
                background: aiRecording ? 'color-mix(in srgb, var(--color-danger) 12%, var(--color-surface))' : 'var(--color-surface)',
                color: aiRecording ? 'var(--color-danger)' : 'var(--color-text-2)',
                cursor: 'pointer',
              }}
            >
              {aiRecording ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button
              onClick={() => askAI()}
              disabled={!aiInput.trim() || aiLoading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '8px 12px', borderRadius: '8px', border: 'none',
                background: 'var(--color-primary)', color: '#fff', cursor: 'pointer',
                opacity: (!aiInput.trim() || aiLoading) ? 0.4 : 1,
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── PAGE DEVIS (3 colonnes) ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function Devis() {
  const navigate = useNavigate()

  // Sessions = historique de fichiers analysés (localStorage)
  const [sessions, setSessions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('devis_sessions') || '[]') } catch { return [] }
  })
  const [activeSessionId, setActiveSessionId] = useState(null)
  const activeSession = sessions.find(s => s.id === activeSessionId) || null

  // Upload
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const fileInputRef = useRef(null)

  const results = activeSession?.results || []

  const [conseils, setConseils] = useState([])
  const [conseilsLoading, setConseilsLoading] = useState(false)
  const [applyError, setApplyError] = useState('')

  const handleAnalyzeConseils = async () => {
    if (!activeSession) return
    setConseilsLoading(true)
    try {
      const res = await api.post('/devis/conseils', {
        session: activeSession,
        results,
      })
      setConseils(res.conseils || res.data || [])
    } catch {
      setConseils([{ label: 'Erreur lors de l’analyse des conseils', applicable: false }])
    } finally {
      setConseilsLoading(false)
    }
  }

  const handleApplyConseil = async (conseil) => {
    if (!activeSession || !conseil) return
    setApplyError('')
    try {
      const res = await api.post('/devis/apply-conseil', {
        session: activeSession,
        conseil,
      })
      if (res.results) {
        setSessions(prev => prev.map(s => (s.id === activeSession.id ? { ...s, results: res.results } : s)))
      }
      handleAnalyzeConseils()
    } catch (err) {
      setApplyError(String(err.error || err.message || err))
    }
  }

  // Panel IA
  const [aiRow, setAiRow] = useState(null)
  const [aiMessages, setAiMessages] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const aiEndRef = useRef(null)
  const aiInputRef = useRef(null)
  const [aiRecording, setAiRecording] = useState(false)
  const aiSpeechRef = useRef(null)

  const toggleAiMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Reconnaissance vocale non supportée par ce navigateur.'); return }
    if (aiRecording) {
      aiSpeechRef.current?.stop()
      setAiRecording(false)
      return
    }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ')
      setAiInput(prev => (prev ? prev + ' ' + text : text))
    }
    rec.onend = () => setAiRecording(false)
    rec.onerror = () => setAiRecording(false)
    aiSpeechRef.current = rec
    rec.start()
    setAiRecording(true)
  }

  // Modal devis
  const [devisOpen, setDevisOpen] = useState(false)
  const [devisText, setDevisText] = useState('')
  const [copied, setCopied] = useState(false)

  // Workspace layout: collapsible left, assistant dock + sizes
  const [leftCollapsed, setLeftCollapsed] = useState(() => localStorage.getItem(UI_KEY.leftCollapsed) === '1')
  const [assistantDock, setAssistantDock] = useState(() => {
    const v = localStorage.getItem(UI_KEY.assistantDock)
    return v === 'bottom' ? 'bottom' : 'right'
  })
  const [rightWidth, setRightWidth] = useState(() => {
    const n = parseInt(localStorage.getItem(UI_KEY.rightWidth) || '', 10)
    return Number.isFinite(n) ? Math.min(RIGHT_W_MAX, Math.max(RIGHT_W_MIN, n)) : 400
  })
  const [bottomHeight, setBottomHeight] = useState(() => {
    const n = parseInt(localStorage.getItem(UI_KEY.bottomHeight) || '', 10)
    if (Number.isFinite(n)) return Math.min(BOTTOM_H_MAX, Math.max(BOTTOM_H_MIN, n))
    return typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.36) : 360
  })

  useEffect(() => {
    localStorage.setItem(UI_KEY.leftCollapsed, leftCollapsed ? '1' : '0')
  }, [leftCollapsed])
  useEffect(() => {
    localStorage.setItem(UI_KEY.assistantDock, assistantDock)
  }, [assistantDock])
  useEffect(() => {
    localStorage.setItem(UI_KEY.rightWidth, String(rightWidth))
  }, [rightWidth])
  useEffect(() => {
    localStorage.setItem(UI_KEY.bottomHeight, String(bottomHeight))
  }, [bottomHeight])

  const startRightResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = rightWidth
    const onMove = (ev) => {
      const delta = startX - ev.clientX
      setRightWidth(Math.min(RIGHT_W_MAX, Math.max(RIGHT_W_MIN, startW + delta)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [rightWidth])

  const startBottomResize = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = bottomHeight
    const onMove = (ev) => {
      const delta = ev.clientY - startY
      setBottomHeight(Math.min(BOTTOM_H_MAX, Math.max(BOTTOM_H_MIN, startH - delta)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [bottomHeight])

  // Persist sessions
  useEffect(() => {
    localStorage.setItem('devis_sessions', JSON.stringify(sessions))
  }, [sessions])

  // Scroll IA
  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  // ── Drag & Drop ────────────────────────────────────────────────────────
  const onDragOver = useCallback((e) => { e.preventDefault(); setDragging(true) }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])
  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.toLowerCase().endsWith('.xlsx')) analyzeFile(f)
    else setError('Seuls les fichiers .xlsx sont acceptés')
  }, [])

  // ── Analyse ────────────────────────────────────────────────────────────
  const analyzeFile = async (f) => {
    setAnalyzing(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/devis/analyze', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)

      const newSession = {
        id: Date.now().toString(),
        name: f.name,
        date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        count: data.results?.length || 0,
        results: data.results || [],
      }
      setSessions(prev => [newSession, ...prev])
      setActiveSessionId(newSession.id)
      setExpandedRow(0)
      setAiRow(0)
      setAiMessages([])
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Sélection de ligne → chat IA ───────────────────────────────────────
  const selectRow = (index) => {
    if (aiRow !== index) {
      setAiRow(index)
      setAiMessages([])
      setAiInput('')
    }
    setExpandedRow(index)
    setTimeout(() => aiInputRef.current?.focus(), 100)
  }

  // ── Envoyer question Gemma ─────────────────────────────────────────────
  const askAI = async (question = aiInput) => {
    const q = (question || aiInput).trim()
    if (!q || aiLoading) return
    const row = aiRow !== null ? results[aiRow] : null
    setAiMessages(prev => [...prev, { role: 'user', content: q }])
    setAiInput('')
    setAiLoading(true)
    try {
      const data = await api.post('/devis/ask', {
        rows: row ? [row] : [],
        question: q,
        mdFiles: row?.docs ?? [],
      })
      setAiMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
    } catch (err) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: `❌ Erreur : ${err.error || err.message}` }])
    } finally {
      setAiLoading(false)
    }
  }

  // ── Session management ─────────────────────────────────────────────────
  const deleteSession = (id) => {
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSessionId === id) {
      setActiveSessionId(null)
      setAiRow(null)
      setAiMessages([])
    }
  }

  const newSession = () => {
    setActiveSessionId(null)
    setAiRow(null)
    setAiMessages([])
    setExpandedRow(null)
    setError('')
  }

  // ── Devis generation ──────────────────────────────────────────────────
  const buildDevis = () => {
    const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    const fmt = (v) => v != null ? v.toLocaleString('fr-FR') + ' €' : '—'

    const lines = results.map((r, i) => {
      const opts = r.options?.map(o => `  - ${o.label}${o.prix != null ? ` : +${o.prix.toLocaleString('fr-FR')} €` : ''}${o.note ? ` *(${o.note})*` : ''}`).join('\n') ?? ''
      const alts = r.alertes?.map(a => `  ${a}`).join('\n') ?? ''
      return [
        `### Ligne ${i + 1} — ${r.gamme} ${r.vantail}`,
        `| Champ | Valeur |`,
        `|---|---|`,
        `| Type | ${r.type} |`,
        `| Dimensions HT | H **${r.dim_standard?.h ?? '?'}** × L **${r.dim_standard?.l ?? '?'}** mm |`,
        `| Prix base TG | **${fmt(r.prix_base_ht)}** HT |`,
        r.options?.length ? `| Options | ${r.options.map(o => o.label).join(', ')} |` : null,
        r.prix_total_min_ht != null ? `| **Total estimé** | **${fmt(r.prix_total_min_ht)} HT TG** |` : null,
        `| Serrure | ${r.serrure?.ref ?? '—'} |`,
        r.ferme_porte?.ref ? `| Ferme-porte | ${r.ferme_porte.ref} |` : null,
        opts ? `\n**Options détail :**\n${opts}` : null,
        alts ? `\n**Alertes :**\n${alts}` : null,
        `\n*Docs : ${r.docs?.join(' → ')}*`,
      ].filter(Boolean).join('\n')
    }).join('\n\n---\n\n')

    const grand = results.reduce((s, r) => s + (r.prix_total_min_ht ?? 0), 0)
    const grandFmt = grand > 0 ? `**${grand.toLocaleString('fr-FR')} € HT TG**` : '—'

    return [
      `# Devis NEXUS — ${date}`,
      `> *Estimatif — tarif NEXUS 2026-01. Sans serrures ni équipements non détectés.*`,
      '', lines, '', '---', '',
      `## 💶 Total général estimé : ${grandFmt}`,
    ].join('\n')
  }

  const openDevis = () => { setDevisText(buildDevis()); setDevisOpen(true) }
  const copyDevis = () => { navigator.clipboard.writeText(devisText); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const aiRowData = aiRow !== null ? results[aiRow] : null

  const leftPanelProps = {
    collapsed: leftCollapsed,
    onToggleCollapse: () => setLeftCollapsed(v => !v),
    sessions,
    activeId: activeSessionId,
    onSelect: (id) => { setActiveSessionId(id); setAiRow(0); setAiMessages([]); setExpandedRow(0) },
    onNew: newSession,
    onDelete: deleteSession,
    dragging,
    onDragOver,
    onDragLeave,
    onDrop,
    fileInputRef,
    onFileChange: analyzeFile,
  }

  const rightPanelProps = {
    row: aiRowData,
    aiRow,
    aiMessages,
    aiInput,
    setAiInput,
    aiLoading,
    askAI,
    aiEndRef,
    aiInputRef,
    conseils,
    aiRecording,
    toggleAiMic,
    onAnalyzeConseils: handleAnalyzeConseils,
    onApplyConseil: handleApplyConseil,
  }

  const centerColumn = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {analyzing ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--color-text-3)' }}>
          <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: '13px' }}>Analyse en cours…</span>
        </div>
      ) : error ? (
        <div style={{ padding: 20 }}>
          <div style={{
            padding: '12px 14px', borderRadius: '10px',
            background: 'rgba(163,60,60,0.08)', border: '1px solid #a33c3c',
            color: '#a33c3c', fontSize: '13px',
          }}>
            ❌ {error}
          </div>
        </div>
      ) : !activeSession ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-3)', textAlign: 'center', padding: 20 }}>
          <div>
            <Upload size={40} style={{ opacity: 0.15, marginBottom: 12 }} /><br />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Importez un fichier Excel</span><br />
            <span style={{ fontSize: '12px' }}>Glissez un .xlsx dans le panneau de fichiers<br />ou cliquez sur le bouton +</span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileSpreadsheet size={15} color="var(--color-primary)" />
              <span style={{ fontWeight: 600, fontSize: '13px' }}>
                {results.length} ligne{results.length > 1 ? 's' : ''} analysée{results.length > 1 ? 's' : ''}
              </span>
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()} style={ghostBtn()}>
              <RefreshCw size={12} /> Nouveau fichier
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((row, i) => (
              <RowCard
                key={i}
                row={row}
                index={i}
                active={aiRow === i}
                expanded={expandedRow === i}
                onToggle={() => setExpandedRow(expandedRow === i ? null : i)}
                onSelect={() => selectRow(i)}
              />
            ))}
          </div>
          {(() => {
            const total = results.reduce((s, r) => s + (r.prix_total_min_ht ?? 0), 0)
            if (!total) return null
            return (
              <div style={{
                marginTop: 14, padding: '12px 16px', borderRadius: '10px',
                background: 'var(--color-surface)', border: '2px solid var(--color-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontWeight: 700, fontSize: '13px' }}>💶 Total général estimé</span>
                <span style={{ fontWeight: 800, fontSize: '16px' }}>{total.toLocaleString('fr-FR')} € HT TG</span>
              </div>
            )
          })()}
          <p style={{ fontSize: '10px', color: 'var(--color-text-3)', textAlign: 'center', marginTop: 8, marginBottom: 0 }}>
            Estimatif — tarif NEXUS 2026-01
          </p>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Topbar ── */}
      <header className="admin-topbar" style={{ borderRadius: 0, flexShrink: 0, margin: 0 }}>
        <div className="admin-topbar-brand">
          <div className="admin-topbar-mark">
            <FileSpreadsheet size={18} strokeWidth={2} />
          </div>
          <div className="admin-topbar-text">
            <h1>Devis NEXUS</h1>
            <p>{activeSession ? `${activeSession.name} — ${activeSession.count} lignes` : 'Chiffrage portes NEXUS 2026'}</p>
          </div>
        </div>
        <div className="admin-topbar-actions">
          {results.length > 0 && (
            <button className="admin-btn-primary" onClick={openDevis} style={{ fontSize: '0.8125rem' }}>
              <FileText size={14} /> Générer devis
            </button>
          )}
          <button type="button" className="admin-btn-ghost" onClick={() => navigate('/chat')}>
            <MessageCircleReply size={16} />
            <span>Retour au chat</span>
          </button>
        </div>
      </header>

      {/* Workspace: dock assistant + collapsible files */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '8px 14px',
          borderBottom: '1px solid var(--color-border)',
          background: 'color-mix(in srgb, var(--color-surface) 92%, var(--color-bg))',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-3)', letterSpacing: '0.06em' }}>Mise en page</span>
        <button
          type="button"
          onClick={() => setLeftCollapsed(v => !v)}
          title={leftCollapsed ? 'Afficher le panneau fichiers' : 'Réduire le panneau fichiers'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: '8px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <LayoutPanelLeft size={14} />
          Fichiers
        </button>
        <div style={{ display: 'inline-flex', borderRadius: '8px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setAssistantDock('right')}
            title="Assistant à droite (largeur réglable)"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: assistantDock === 'right' ? 'color-mix(in srgb, var(--color-primary) 18%, var(--color-surface))' : 'var(--color-surface)',
              color: assistantDock === 'right' ? 'var(--color-primary)' : 'var(--color-text-2)',
            }}
          >
            <LayoutGrid size={14} /> Droite
          </button>
          <button
            type="button"
            onClick={() => setAssistantDock('bottom')}
            title="Assistant en bas — pleine largeur pour tableaux"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', border: 'none', borderLeft: '1px solid var(--color-border)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: assistantDock === 'bottom' ? 'color-mix(in srgb, var(--color-primary) 18%, var(--color-surface))' : 'var(--color-surface)',
              color: assistantDock === 'bottom' ? 'var(--color-primary)' : 'var(--color-text-2)',
            }}
          >
            <PanelBottom size={14} /> Bas
          </button>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--color-text-3)', flex: 1, minWidth: '200px' }}>
          {assistantDock === 'right'
            ? 'Poignée verticale entre la liste et l’assistant pour élargir la zone IA.'
            : 'Poignée horizontale au-dessus de l’assistant pour régler la hauteur — idéal pour lire les tableaux.'}
        </span>
      </div>

      {applyError && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '8px 14px',
            background: 'rgba(163,60,60,0.1)',
            borderBottom: '1px solid rgba(163,60,60,0.25)',
            fontSize: '12px',
            color: '#a33c3c',
          }}
        >
          <span>{applyError}</span>
          <button type="button" onClick={() => setApplyError('')} style={{ ...iconBtn(), color: '#a33c3c' }} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Main workspace ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: assistantDock === 'bottom' ? 'column' : 'row',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {assistantDock === 'bottom' ? (
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden' }}>
              <LeftPanel {...leftPanelProps} />
              {centerColumn}
            </div>
            {/* Resize assistant height (bottom dock) */}
            <div
              role="separator"
              aria-label="Redimensionner la hauteur du panneau assistant"
              onMouseDown={startBottomResize}
              style={{
                height: 6,
                flexShrink: 0,
                cursor: 'row-resize',
                background: 'linear-gradient(180deg, var(--color-border), transparent)',
                borderTop: '1px solid var(--color-border)',
              }}
            />
            <div
              style={{
                height: bottomHeight,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                minHeight: BOTTOM_H_MIN,
                maxHeight: BOTTOM_H_MAX,
                overflow: 'hidden',
              }}
            >
              <RightPanel {...rightPanelProps} layoutMode="bottom" />
            </div>
          </>
        ) : (
          <>
            <LeftPanel {...leftPanelProps} />
            {centerColumn}
            <div
              role="separator"
              aria-label="Redimensionner la largeur du panneau assistant"
              onMouseDown={startRightResize}
              style={{
                width: 6,
                flexShrink: 0,
                cursor: 'col-resize',
                background: 'linear-gradient(90deg, var(--color-border), transparent)',
                borderLeft: '1px solid var(--color-border)',
              }}
            />
            <RightPanel {...rightPanelProps} layoutMode="right" panelWidth={rightWidth} />
          </>
        )}
      </div>

      {/* ── Modal devis ── */}
      {devisOpen && (
        <div className="chat-modal-backdrop" onClick={() => setDevisOpen(false)}>
          <div
            className="chat-modal"
            style={{ maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="chat-modal-header">
              <h2 className="chat-modal-title">
                <FileText size={16} color="var(--color-primary)" style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Devis généré
              </h2>
              <button className="chat-modal-close" onClick={() => setDevisOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 1.25rem', marginBottom: '0.75rem' }}>
              <button className="chat-modal-btn chat-modal-btn--secondary" onClick={copyDevis} style={{ flex: 'none' }}>
                {copied ? <><Check size={13} /> Copié !</> : <><Copy size={13} /> Copier</>}
              </button>
              <button className="chat-modal-btn chat-modal-btn--secondary" onClick={() => window.print()} style={{ flex: 'none' }}>
                <Printer size={13} /> Imprimer
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: '0 1.25rem 1.25rem', flex: 1 }}>
              <MarkdownRenderer content={devisText} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers styles ────────────────────────────────────────────────────────────
function iconBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 5, borderRadius: '6px', border: 'none',
    background: 'transparent', color: 'var(--color-text-2)',
    cursor: 'pointer', transition: 'color 0.1s',
  }
}
function ghostBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'transparent', color: 'var(--color-text-2)',
    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
  }
}
