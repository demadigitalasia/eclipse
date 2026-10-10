import { useState } from 'react'

export default function ProfileAvatar({
  name,
  photoUpdatedAt,
  className = '',
}: {
  name: string
  photoUpdatedAt?: string
  className?: string
}) {
  const [failedUrl, setFailedUrl] = useState('')
  const photoUrl = photoUpdatedAt ? `/api/auth/me/avatar?v=${encodeURIComponent(photoUpdatedAt)}` : ''
  const showPhoto = photoUrl !== '' && photoUrl !== failedUrl

  return (
    <span className={`rail-avatar ${className}`.trim()} aria-hidden="true">
      {showPhoto
        ? <img src={photoUrl} alt="" onError={() => setFailedUrl(photoUrl)} />
        : name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
