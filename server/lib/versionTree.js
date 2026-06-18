/**
 * Version tree helpers — numbering, nesting and relationship between quote versions.
 */

export function buildVersionNumberMap(versions = []) {
  const childrenByParent = new Map()
  for (const version of versions) {
    const key = Number(version.parent_version_id || 0)
    const list = childrenByParent.get(key) || []
    list.push(version)
    childrenByParent.set(key, list)
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => Number(a.id) - Number(b.id))
  }
  const numbers = new Map()
  const walk = (parentId, prefix) => {
    for (const [index, version] of (childrenByParent.get(parentId) || []).entries()) {
      const number = prefix ? `${prefix}.${index + 1}` : String(index + 1)
      numbers.set(Number(version.id), number)
      walk(Number(version.id), number)
    }
  }
  walk(0, '')
  return numbers
}

export function buildVersionTree(versions = []) {
  const childrenByParent = new Map()
  for (const version of versions) {
    const key = Number(version.parent_version_id || 0)
    const list = childrenByParent.get(key) || []
    list.push(version)
    childrenByParent.set(key, list)
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => Number(a.id) - Number(b.id))
  }
  const numbers = buildVersionNumberMap(versions)
  const walk = (parentId) => (
    (childrenByParent.get(parentId) || []).map((version) => ({
      ...version,
      number: numbers.get(Number(version.id)) || version.version_label,
      children: walk(Number(version.id)),
    }))
  )
  return walk(0)
}

function ancestorChain(versionId, byId) {
  const chain = []
  let current = Number(versionId)
  const seen = new Set()
  while (current && !seen.has(current)) {
    seen.add(current)
    const row = byId.get(current)
    if (!row) break
    chain.push(current)
    current = Number(row.parent_version_id || 0)
  }
  return chain
}

export function getVersionRelationship(versionAId, versionBId, versions = []) {
  const a = Number(versionAId)
  const b = Number(versionBId)
  if (!a || !b) return 'unknown'
  if (a === b) return 'same'

  const byId = new Map(versions.map(version => [Number(version.id), version]))
  const ancestorsA = new Set(ancestorChain(a, byId))
  const ancestorsB = new Set(ancestorChain(b, byId))

  const parentA = Number(byId.get(a)?.parent_version_id || 0)
  const parentB = Number(byId.get(b)?.parent_version_id || 0)

  if (parentB === a) return 'parent_child'
  if (parentA === b) return 'child_parent'
  if (ancestorsB.has(a)) return 'ancestor_descendant'
  if (ancestorsA.has(b)) return 'descendant_ancestor'
  if (parentA && parentA === parentB) return 'siblings'
  return 'unrelated'
}

export function versionRelationshipLabel(relationship) {
  return {
    same: 'Même version',
    parent_child: 'A est parente de B',
    child_parent: 'B est parente de A',
    ancestor_descendant: 'A est ancêtre de B',
    descendant_ancestor: 'B est ancêtre de A',
    siblings: 'Versions sœurs (même parent)',
    unrelated: 'Branches distinctes',
    unknown: 'Relation inconnue',
  }[relationship] || relationship
}

export function versionDisplayLabel(version, numberMap = null) {
  if (!version) return 'Version de travail'
  const number = numberMap?.get(Number(version.id)) || version.number || version.version_label
  const title = version.title || version.branch_label || null
  return title ? `${number} — ${title}` : String(number || 'Version de travail')
}

export function isVersionLocked(version) {
  return Boolean(version?.locked_at || version?.status === 'sent_hubspot' || version?.status === 'archived' || version?.locked)
}
