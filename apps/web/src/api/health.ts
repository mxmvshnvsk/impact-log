import { type HealthResponse, healthResponseSchema } from '@impact-log/shared'
import { request } from './http'

export function fetchHealth(): Promise<HealthResponse> {
  return request('/health', healthResponseSchema)
}
