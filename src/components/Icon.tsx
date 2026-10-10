import type { SVGProps } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  Clapperboard,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LayoutGrid,
  LogOut,
  Maximize,
  Menu,
  Minimize,
  Minus,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  ShieldCheck,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Trash,
  Undo2,
  Upload,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'

export type IconName =
  | 'eye'
  | 'eyeOff'
  | 'x'
  | 'trash'
  | 'check'
  | 'plus'
  | 'minus'
  | 'menu'
  | 'arrowRight'
  | 'arrowLeft'
  | 'undo2'
  | 'redo2'
  | 'play'
  | 'pause'
  | 'skipBack'
  | 'skipForward'
  | 'fullscreen'
  | 'fullscreenExit'
  | 'repeat'
  | 'sparkle'
  | 'grid'
  | 'clapper'
  | 'creditCard'
  | 'sliders'
  | 'shield'
  | 'logout'
  | 'chevronDown'
  | 'book'
  | 'users'
  | 'key'
  | 'upload'
  | 'activity'
  | 'bell'
  | 'globe'

const ICONS: Record<IconName, LucideIcon> = {
  eye: Eye,
  eyeOff: EyeOff,
  x: X,
  trash: Trash,
  check: Check,
  plus: Plus,
  minus: Minus,
  menu: Menu,
  arrowRight: ArrowRight,
  arrowLeft: ArrowLeft,
  undo2: Undo2,
  redo2: Redo2,
  play: Play,
  pause: Pause,
  skipBack: SkipBack,
  skipForward: SkipForward,
  fullscreen: Maximize,
  fullscreenExit: Minimize,
  repeat: Repeat,
  sparkle: Sparkles,
  grid: LayoutGrid,
  clapper: Clapperboard,
  creditCard: CreditCard,
  sliders: SlidersHorizontal,
  shield: ShieldCheck,
  logout: LogOut,
  chevronDown: ChevronDown,
  book: BookOpen,
  users: Users,
  key: KeyRound,
  upload: Upload,
  activity: Activity,
  bell: Bell,
  globe: Globe,
}

type IconProps = {
  name: IconName
  size?: number
  strokeWidth?: number
} & Omit<SVGProps<SVGSVGElement>, 'name' | 'size' | 'strokeWidth'>

export default function Icon({ name, size = 16, strokeWidth = 1.75, ...props }: IconProps) {
  const IconComponent = ICONS[name]
  return (
    <IconComponent
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  )
}
