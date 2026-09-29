import {
  keyRotationSchema,
  keysResponseSchema,
  okResponseSchema,
  rotationAbortRequestSchema,
  rotationCommitResponseSchema,
  rotationStageRequestSchema,
  rotationStageResponseSchema,
  rotationStartRequestSchema,
  SYNC_ACCOUNT_HEADER,
} from '@impact-log/shared'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { AppError } from '../../lib/errors'
import { rateLimit } from '../../lib/rateLimit'
import { fullSessionOf, requireSession } from '../../plugins/session'
import type { RotationService } from './rotation.service'

type Options = {
  rotation: RotationService
  /** Запросов stage/commit в минуту на пользователя (тот же SYNC_RATE_LIMIT_MAX, отдельный счётчик) */
  rateLimitMax: number
}

/** Как у push: до 200 объектов по 256 КиБ не влезают — режем тело здесь */
const STAGE_BODY_LIMIT = 8 * 1024 * 1024
const MINUTE = 60_000
const ACCOUNT_HEADER = SYNC_ACCOUNT_HEADER.toLowerCase()

/**
 * Необязательная сверка аккаунта для операций над объектами (stage, commit): если клиент прислал
 * X-Impact-Account и он не совпал с пользователем сессии → 409 ACCOUNT_MISMATCH (вкладка хранилища одного
 * аккаунта не завершит ротацию другого). Без заголовка — не проверяем (в контракте ротации он не обязателен).
 */
async function checkAccountHeader(request: FastifyRequest) {
  const header = request.headers[ACCOUNT_HEADER]
  if (typeof header !== 'string' || header.trim() === '') return
  if (header.trim() !== fullSessionOf(request).user.accountId) {
    throw new AppError('ACCOUNT_MISMATCH', 409)
  }
}

/**
 * Ключевые конверты и ротация Master Key (ADR-0006, ADR-0012). Клиент открывает password-конверт KEK'ом
 * из пароля и получает MK текущей эпохи; ротация: start → stage… → commit (или abort).
 */
export const keysRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  { rotation, rateLimitMax },
) => {
  const full = requireSession('full')
  // Черновик и commit — объёмные операции над объектами: лимит на пользователя, щедрый, как у синхронизации
  // (свой счётчик: перешифровка большого аккаунта не отнимает запросы у sync). Проверки — в onRequest,
  // до разбора тела в 8 МиБ
  const perUser = app.rateLimit({
    max: rateLimitMax,
    timeWindow: MINUTE,
    keyGenerator: (request) => `rotation:${fullSessionOf(request).user.id}`,
  })

  app.get(
    '/',
    { preHandler: full, schema: { response: { 200: keysResponseSchema } } },
    async (request) => rotation.keys(fullSessionOf(request).user.id),
  )

  app.post(
    '/rotation/start',
    {
      config: rateLimit(10, 15),
      preHandler: full,
      schema: { body: rotationStartRequestSchema, response: { 200: keyRotationSchema } },
    },
    async (request) => rotation.start(fullSessionOf(request), request.body),
  )

  app.post(
    '/rotation/stage',
    {
      onRequest: [full, perUser, checkAccountHeader],
      bodyLimit: STAGE_BODY_LIMIT,
      schema: { body: rotationStageRequestSchema, response: { 200: rotationStageResponseSchema } },
    },
    async (request) => rotation.stage(fullSessionOf(request), request.body),
  )

  app.post(
    '/rotation/commit',
    {
      onRequest: [full, perUser, checkAccountHeader],
      schema: { response: { 200: rotationCommitResponseSchema } },
    },
    async (request) => rotation.commit(fullSessionOf(request)),
  )

  app.post(
    '/rotation/abort',
    {
      config: rateLimit(10, 15),
      preHandler: full,
      schema: { body: rotationAbortRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await rotation.abort(fullSessionOf(request), request.body?.currentAuthKey)
      return { ok: true } as const
    },
  )
}
