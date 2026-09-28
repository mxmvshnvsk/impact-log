import type { User } from '@impact-log/shared'
import type { UserRow } from '../../db/schema'

export function toUserDto(user: UserRow): User {
  return {
    id: user.id,
    accountId: user.accountId,
    login: user.login,
    plan: user.plan,
    createdAt: user.createdAt.toISOString(),
  }
}
