import type { Impact } from '../domain/impact'

/**
 * Граница хранения (ADR-0005, Stage 0). UI работает с доменными Impact через этот интерфейс и не знает,
 * лежат ли данные в IndexedDB, в памяти или синхронизируются с сервером.
 */
export interface ImpactRepository {
  list(): Promise<Impact[]>
  get(objectId: string): Promise<Impact | null>
  /** Создание или обновление (локальная запись коммитится первой, синк — асинхронно) */
  save(impact: Impact): Promise<void>
  remove(objectId: string): Promise<void>
}

/** Хранилище в памяти — для тестов, CLI и как эталон поведения */
export class InMemoryImpactRepository implements ImpactRepository {
  private readonly items = new Map<string, Impact>()

  constructor(initial: readonly Impact[] = []) {
    for (const impact of initial) this.items.set(impact.objectId, impact)
  }

  async list() {
    return [...this.items.values()]
  }

  async get(objectId: string) {
    return this.items.get(objectId) ?? null
  }

  async save(impact: Impact) {
    this.items.set(impact.objectId, impact)
  }

  async remove(objectId: string) {
    this.items.delete(objectId)
  }
}
