import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-vue-next'

export function alertIcon(tone: 'danger' | 'warning' | 'info' | 'success') {
  return { danger: CircleAlert, warning: TriangleAlert, info: Info, success: CircleCheck }[tone]
}
