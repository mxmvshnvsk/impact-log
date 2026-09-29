import {
  type Device,
  devicesResponseSchema,
  okResponseSchema,
  updateDeviceRequestSchema,
} from '@impact-log/shared'
import { and, asc, eq, isNull } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Database } from '../../db/client'
import { type DeviceRow, devices } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { fullSessionOf, requireSession } from '../../plugins/session'
import { deleteDeviceSessions } from '../auth/sessions'
import { cancelRotationOfDevice } from '../keys/rotationStore'

type Options = { db: Database }

const paramsSchema = z.object({ deviceId: z.uuid() })

function toDeviceDto(device: DeviceRow, currentId: string): Device {
  const trusted =
    device.trustTokenHash !== null &&
    device.trustExpiresAt !== null &&
    device.trustExpiresAt.getTime() > Date.now()
  return {
    deviceId: device.id,
    encryptedLabel: device.encryptedLabel,
    trusted,
    createdAt: device.createdAt.toISOString(),
    lastSeenAt: device.lastSeenAt.toISOString(),
    current: device.id === currentId,
  }
}

/** Устройства пользователя (ADR-0008): список, зашифрованное название, отзыв */
export const devicesRoutes: FastifyPluginAsyncZod<Options> = async (app, { db }) => {
  app.addHook('preHandler', requireSession('full'))

  app.get('/', { schema: { response: { 200: devicesResponseSchema } } }, async (request) => {
    const session = fullSessionOf(request)
    const rows = await db
      .select()
      .from(devices)
      .where(and(eq(devices.userId, session.user.id), isNull(devices.revokedAt)))
      .orderBy(asc(devices.createdAt))
    return { devices: rows.map((row) => toDeviceDto(row, session.deviceId)) }
  })

  app.patch(
    '/:deviceId',
    {
      schema: {
        params: paramsSchema,
        body: updateDeviceRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const session = fullSessionOf(request)
      const [updated] = await db
        .update(devices)
        .set({ encryptedLabel: request.body.encryptedLabel })
        .where(
          and(
            eq(devices.id, request.params.deviceId),
            eq(devices.userId, session.user.id),
            isNull(devices.revokedAt),
          ),
        )
        .returning({ id: devices.id })
      if (!updated) throw new AppError('NOT_FOUND', 404)
      return { ok: true } as const
    },
  )

  /**
   * Отзыв: устройство скрывается, его сессии удаляются, «доверие» снимается. Текущее — только через logout.
   * Если устройство начало ротацию MK, она отменяется: завершить её больше некому (ADR-0012)
   */
  app.delete(
    '/:deviceId',
    { schema: { params: paramsSchema, response: { 200: okResponseSchema } } },
    async (request) => {
      const session = fullSessionOf(request)
      const { deviceId } = request.params
      if (deviceId === session.deviceId) throw new AppError('FORBIDDEN', 403)
      await db.transaction(async (tx) => {
        const [revoked] = await tx
          .update(devices)
          .set({ revokedAt: new Date(), trustTokenHash: null, trustExpiresAt: null })
          .where(
            and(
              eq(devices.id, deviceId),
              eq(devices.userId, session.user.id),
              isNull(devices.revokedAt),
            ),
          )
          .returning({ id: devices.id })
        if (!revoked) throw new AppError('NOT_FOUND', 404)
        await deleteDeviceSessions(tx, deviceId)
        await cancelRotationOfDevice(tx, session.user.id, deviceId)
      })
      return { ok: true } as const
    },
  )
}
