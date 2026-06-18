import { createContext, useCallback, useContext, useMemo, useState, useEffect, useRef } from 'react'

const BreadcrumbOverrideContext = createContext({
  overrides: {},
  mergeOverrides: () => {},
  clearOverrideKeys: () => {},
  registerBackHandler: () => {},
  unregisterBackHandler: () => {},
})

export function BreadcrumbOverrideProvider({ children }) {
  const [overrides, setOverrides] = useState({})
  const backHandlerRef = useRef(null)

  const mergeOverrides = useCallback((patch) => {
    setOverrides((previous) => ({ ...previous, ...patch }))
  }, [])

  const clearOverrideKeys = useCallback((keys = []) => {
    setOverrides((previous) => {
      const next = { ...previous }
      for (const key of keys) delete next[key]
      return next
    })
  }, [])

  const registerBackHandler = useCallback((handler) => {
    backHandlerRef.current = handler
  }, [])

  const unregisterBackHandler = useCallback(() => {
    backHandlerRef.current = null
  }, [])

  const invokeBackHandler = useCallback(() => {
    const handler = backHandlerRef.current
    if (!handler) return false
    return Boolean(handler())
  }, [])

  const value = useMemo(
    () => ({
      overrides,
      mergeOverrides,
      clearOverrideKeys,
      registerBackHandler,
      unregisterBackHandler,
      invokeBackHandler,
    }),
    [overrides, mergeOverrides, clearOverrideKeys, registerBackHandler, unregisterBackHandler, invokeBackHandler],
  )

  return (
    <BreadcrumbOverrideContext.Provider value={value}>
      {children}
    </BreadcrumbOverrideContext.Provider>
  )
}

export function useBreadcrumbOverridesState() {
  return useContext(BreadcrumbOverrideContext).overrides
}

/**
 * Register dynamic breadcrumb segments for the current page.
 * @param {Record<string, string|undefined|null>} patch
 */
export function useBreadcrumbOverrideEffect(patch = {}) {
  const { mergeOverrides, clearOverrideKeys } = useContext(BreadcrumbOverrideContext)
  const {
    companyName,
    devisLabel,
    chatProjectName,
    chatDiscussionTitle,
  } = patch

  useEffect(() => {
    const keys = ['companyName', 'devisLabel', 'chatProjectName', 'chatDiscussionTitle'].filter(
      key => patch[key] != null && String(patch[key]).trim() !== '',
    )
    if (!keys.length) return undefined
    const cleaned = Object.fromEntries(keys.map(key => [key, patch[key]]))
    mergeOverrides(cleaned)
    return () => clearOverrideKeys(keys)
  }, [companyName, devisLabel, chatProjectName, chatDiscussionTitle, mergeOverrides, clearOverrideKeys])
}

/** Page-local back (e.g. chat discussion → project). Return true if handled. */
export function useBreadcrumbBackHandler(handler) {
  const { registerBackHandler, unregisterBackHandler } = useContext(BreadcrumbOverrideContext)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    registerBackHandler(() => handlerRef.current?.())
    return () => unregisterBackHandler()
  }, [registerBackHandler, unregisterBackHandler])
}

export function useBreadcrumbBackInvoker() {
  return useContext(BreadcrumbOverrideContext).invokeBackHandler
}
