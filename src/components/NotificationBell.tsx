import { getInlineCopy, getLocale } from '../localization'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '../api'
import type { Lang } from '../types'
import Icon from './Icon'

function copyFor(notification: AppNotification, lang: Lang): [string, string] {
  const id = lang === 'id'
  const plan = String(notification.payload.plan || 'Free').toUpperCase()
  const paymentId = String(notification.payload.paymentId || '')
  const expiry = notification.payload.expiresAt
    ? new Date(String(notification.payload.expiresAt)).toLocaleDateString(getLocale(lang))
    : ''
  const used = Number(notification.payload.used || 0)
  const limit = Number(notification.payload.limit || 0)
  const messages: Record<string, [string, string]> = {
    payment_submitted: id
      ? ['Bukti pembayaran terkirim', 'Pembayaran paket ' + plan + ' menunggu verifikasi admin. ' + paymentId]
      : ['Payment receipt submitted', 'Your ' + plan + ' payment is awaiting admin review. ' + paymentId],
    payment_approved: id
      ? ['Langganan aktif', 'Pembayaran disetujui. Paket ' + plan + ' sekarang aktif pada akun Anda.']
      : ['Subscription activated', 'Payment approved. Your ' + plan + ' plan is now active.'],
    payment_rejected: id
      ? ['Pembayaran perlu diperbaiki', 'Bukti pembayaran paket ' + plan + ' ditolak.' + (notification.payload.note ? ' Catatan: ' + notification.payload.note : '')]
      : ['Payment needs attention', 'Your ' + plan + ' receipt was rejected.' + (notification.payload.note ? ' Note: ' + notification.payload.note : '')],
    payment_expired: id
      ? ['Pesanan pembayaran kedaluwarsa', 'Pesanan paket ' + plan + ' sudah kedaluwarsa. Pilih kembali paket untuk membuat transaksi baru.']
      : ['Payment order expired', 'Your ' + plan + ' order expired. Choose the plan again to create a new payment.'],
    plan_assigned: id
      ? ['Paket akun diperbarui', 'Paket akun Anda sekarang ' + plan + '.' + (expiry ? ' Berlaku sampai ' + expiry + '.' : '')]
      : ['Account plan updated', 'Your account is now on ' + plan + '.' + (expiry ? ' Active through ' + expiry + '.' : '')],
    plan_expiring: id
      ? ['Langganan segera berakhir', 'Paket ' + plan + ' akan berakhir pada ' + expiry + '. Hubungi Hub Admin untuk memperpanjang.']
      : ['Subscription expiring soon', 'Your ' + plan + ' plan expires on ' + expiry + '. Contact Hub Admin to renew.'],
    plan_expired: id
      ? ['Langganan berakhir', 'Masa paket ' + plan + ' telah berakhir pada ' + expiry + '. Hubungi Hub Admin untuk memperpanjang.']
      : ['Subscription expired', 'Your ' + plan + ' plan expired on ' + expiry + '. Contact Hub Admin to renew.'],
    free_expired: id
      ? ['Masa Free berakhir', 'Akses Free berakhir pada ' + expiry + '. Pilih paket Lite atau Pro untuk melanjutkan.']
      : ['Free access ended', 'Free access ended on ' + expiry + '. Choose Lite or Pro to continue.'],
    free_expiring: id
      ? ['Masa Free segera berakhir', 'Akses Free akan berakhir pada ' + expiry + '. Pilih paket untuk melanjutkan setelah masa uji coba.']
      : ['Free access ending soon', 'Free access ends on ' + expiry + '. Choose a plan to continue after your trial.'],
    render_quota_reached: id
      ? ['Kuota generate hari ini habis (' + used + '/' + limit + ')', 'Kuota harian diperbarui besok.']
      : ['Today’s generation quota is used (' + used + '/' + limit + ')', 'Your daily quota resets tomorrow.'],
    analyze_quota_reached: id
      ? ['Kuota analisis hari ini habis (' + used + '/' + limit + ')', 'Kuota harian diperbarui besok.']
      : ['Today’s analysis quota is used (' + used + '/' + limit + ')', 'Your daily quota resets tomorrow.'],
  }
  return messages[notification.kind] || (id
    ? ['Pemberitahuan akun', 'Ada informasi baru untuk akun Anda.']
    : ['Account notification', 'There is new information for your account.'])
}

export default function NotificationBell({ lang }: { lang: Lang }) {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState('')
  const isId = lang === 'id'

  const refresh = useCallback(async () => {
    try {
      const response = await getNotifications()
      setItems(response.notifications)
      setUnreadCount(response.unreadCount)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (getInlineCopy(isId, "copy_notifikasi_gagal_dimuat_f1599ea")))
    }
  }, [isId])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', outside)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('mousedown', outside); window.removeEventListener('keydown', escape) }
  }, [open])

  const openItem = async (item: AppNotification) => {
    if (!item.read_at) {
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row))
      setUnreadCount((count) => Math.max(0, count - 1))
      void markNotificationRead(item.id).catch(() => void refresh())
    }
    setOpen(false)
    navigate(item.kind.includes('quota') ? '/app/studio' : '/app/subscription')
  }

  const markAll = async () => {
    setItems((current) => current.map((row) => ({ ...row, read_at: row.read_at || new Date().toISOString() })))
    setUnreadCount(0)
    try { await markAllNotificationsRead() } catch { await refresh() }
  }

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        className={'notification-bell' + (open ? ' is-open' : '')}
        aria-label={isId ? 'Notifikasi' + (unreadCount ? ', ' + unreadCount + ' belum dibaca' : '') : 'Notifications' + (unreadCount ? ', ' + unreadCount + ' unread' : '')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen((value) => !value); if (!open) void refresh() }}
      >
        <Icon name="bell" size={19} />
        {unreadCount > 0 && <span className="notification-bell__count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-popover" role="dialog" aria-label={getInlineCopy(isId, "copy_pemberitahuan_akun_9e7023d")}>
          <header className="notification-popover__header">
            <div><p className="section-kicker">{getInlineCopy(isId, "copy_pusat_notifikasi_c571165")}</p><h2>{getInlineCopy(isId, "copy_pemberitahuan_8848b62")}</h2></div>
            {unreadCount > 0 && <button type="button" className="btn-ghost btn-sm" onClick={() => void markAll()}>{getInlineCopy(isId, "copy_tandai_semua_dibaca_92c80f3")}</button>}
          </header>
          {error && <div className="notification-popover__error"><span>{error}</span><button type="button" className="btn-secondary btn-sm" onClick={() => void refresh()}>{getInlineCopy(isId, "copy_coba_lagi_f7ed4b5")}</button></div>}
          {!error && items.length === 0 && <p className="notification-empty">{getInlineCopy(isId, "copy_belum_ada_pemberitahuan_7df072f")}</p>}
          <div className="notification-list">
            {items.map((item) => {
              const [title, body] = copyFor(item, lang)
              return <button type="button" key={item.id} className={'notification-item' + (item.read_at ? '' : ' is-unread')} onClick={() => void openItem(item)}>
                <span className="notification-item__marker" aria-hidden="true" />
                <span className="notification-item__content"><strong>{title}</strong><span>{body}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(getLocale(lang))}</time></span>
              </button>
            })}
          </div>
        </section>
      )}
    </div>
  )
}
