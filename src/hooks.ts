import { useEffect, useRef } from 'react'

/** Kembalikan fokus ke pemicu saat dialog ditutup (pola 05-DESAIN).
 *  Pakai `active` untuk dialog kondisional; default true untuk komponen
 *  dialog yang mount/unmount bersama dialognya. */
export function useFocusReturn(active = true) {
  const prevRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!active) return
    prevRef.current = document.activeElement as HTMLElement | null
    return () => {
      const el = prevRef.current
      if (el && document.contains(el)) el.focus()
    }
  }, [active])
}

/** Tambah .is-visible saat elemen masuk viewport. Sekali saja. */
export function useReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible')
      return
    }
    const targets = el.classList.contains('reveal-group')
      ? Array.from(el.querySelectorAll('.reveal'))
      : [el]
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            io.unobserve(e.target)
          }
        }
      },
      { threshold },
    )
    targets.forEach((t) => io.observe(t))
    return () => io.disconnect()
  }, [threshold])
  return ref
}
