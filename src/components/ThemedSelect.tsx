import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

export interface ThemedSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface Props {
  id?: string
  label: string
  value: string
  options: ThemedSelectOption[]
  disabled?: boolean
  onChange: (value: string) => void
}

export default function ThemedSelect({ id, label, value, options, disabled = false, onChange }: Props) {
  const generatedId = useId()
  const listboxId = `${generatedId}-options`
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const selected = options[selectedIndex]

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return
    const positionMenu = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const viewportPadding = 8
      const gap = 6
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding - gap
      const availableAbove = rect.top - viewportPadding - gap
      const desiredHeight = Math.min(300, Math.max(76, options.length * 38 + 8))
      const openAbove = availableBelow < Math.min(desiredHeight, 180) && availableAbove > availableBelow
      const availableHeight = Math.max(76, openAbove ? availableAbove : availableBelow)
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2)
      const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding)
      setMenuStyle({
        position: 'fixed',
        zIndex: 1000,
        left,
        width,
        maxHeight: Math.min(desiredHeight, availableHeight),
        top: openAbove ? undefined : rect.bottom + gap,
        bottom: openAbove ? window.innerHeight - rect.top + gap : undefined,
      })
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, options.length])

  const focusOption = (index: number) => optionRefs.current[index]?.focus()
  const openAndFocus = (index: number) => {
    setOpen(true)
    requestAnimationFrame(() => focusOption(index))
  }
  const choose = (option: ThemedSelectOption) => {
    if (disabled || option.disabled) return
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="themed-select" ref={rootRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`themed-select__trigger${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const direction = event.key === 'ArrowDown' ? 1 : -1
            let next = selectedIndex
            for (let count = 0; count < options.length; count += 1) {
              if (!options[next]?.disabled) break
              next = (next + direction + options.length) % options.length
            }
            openAndFocus(next)
          }
        }}
      >
        <span>{selected?.label ?? value}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          className="themed-select__menu"
          role="listbox"
          aria-label={label}
          style={menuStyle}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element }}
              type="button"
              role="option"
              aria-selected={value === option.value}
              disabled={disabled || option.disabled}
              className={`themed-select__option${value === option.value ? ' is-selected' : ''}`}
              onClick={() => choose(option)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const direction = event.key === 'ArrowDown' ? 1 : -1
                  let next = index
                  for (let count = 0; count < options.length; count += 1) {
                    next = (next + direction + options.length) % options.length
                    if (!options[next].disabled) break
                  }
                  focusOption(next)
                } else if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault()
                  let next = -1
                  if (event.key === 'Home') next = options.findIndex((item) => !item.disabled)
                  else {
                    for (let optionIndex = options.length - 1; optionIndex >= 0; optionIndex -= 1) {
                      if (!options[optionIndex].disabled) { next = optionIndex; break }
                    }
                  }
                  if (next >= 0) focusOption(next)
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  choose(option)
                }
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
