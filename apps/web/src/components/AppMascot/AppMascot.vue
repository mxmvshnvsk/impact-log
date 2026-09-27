<template>
  <div
    class="mascot"
    :class="[`mascot--${mood}`, action && `mascot--act-${action}`, { 'mascot--static': reducedMotion }]"
  >
    <p v-if="message" class="mascot__bubble" aria-live="polite">{{ message }}</p>
    <svg class="mascot__svg" viewBox="0 0 200 180" aria-hidden="true">
      <defs>
        <radialGradient :id="glowId" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stop-color="#16352a" />
          <stop offset="100%" stop-color="#08120e" />
        </radialGradient>
        <clipPath :id="screenClipId">
          <rect x="42" y="44" width="116" height="90" rx="12" />
        </clipPath>
      </defs>

      <ellipse class="mascot__shadow" cx="100" cy="174" rx="62" ry="5" />

      <g class="mascot__body-group">
        <!-- ножки-упоры -->
        <rect class="mascot__foot" x="48" y="160" width="22" height="10" rx="4" />
        <rect class="mascot__foot" x="130" y="160" width="22" height="10" rx="4" />

        <!-- корпус -->
        <rect class="mascot__case" x="28" y="30" width="144" height="134" rx="24" />
        <rect class="mascot__bezel" x="38" y="40" width="124" height="98" rx="16" />

        <!-- экран -->
        <g :clip-path="`url(#${screenClipId})`">
          <rect class="mascot__screen" x="42" y="44" width="116" height="90" rx="12" :fill="`url(#${glowId})`" />
          <path
            class="mascot__scanlines"
            d="M42 50 H158 M42 56 H158 M42 62 H158 M42 68 H158 M42 74 H158 M42 80 H158 M42 86 H158 M42 92 H158 M42 98 H158 M42 104 H158 M42 110 H158 M42 116 H158 M42 122 H158 M42 128 H158"
          />

          <g class="mascot__face">
            <!-- глаза: пиксельные, светятся -->
            <g class="mascot__eyes" :style="eyesStyle">
              <rect class="mascot__eye mascot__eye--left" x="66" y="70" width="16" height="22" rx="4" />
              <rect class="mascot__eye mascot__eye--right" x="118" y="70" width="16" height="22" rx="4" />
            </g>
            <!-- зажмурился: > < (пароль, код 2FA) -->
            <path class="mascot__squint mascot__squint--left" d="M67 73 L80 81 L67 89" />
            <path class="mascot__squint mascot__squint--right" d="M133 73 L120 81 L133 89" />
            <!-- закрытые глаза (сон, спрятался) -->
            <path class="mascot__eyes-closed" d="M66 84 H82 M118 84 H134" />
            <!-- радость: ^ ^ -->
            <path class="mascot__eyes-happy" d="M66 86 L74 76 L82 86 M118 86 L126 76 L134 86" />
            <!-- ошибка: x x -->
            <path class="mascot__eyes-oops" d="M67 74 L81 88 M81 74 L67 88 M119 74 L133 88 M133 74 L119 88" />
            <!-- рот — мигающий курсор терминала -->
            <rect class="mascot__cursor" x="92" y="108" width="16" height="4" rx="1" />
          </g>
        </g>

        <!-- индикатор питания и решётка -->
        <circle class="mascot__led" cx="150" cy="152" r="3.5" />
        <path class="mascot__vents" d="M48 150 H72 M48 155 H66" />

      </g>

      <g class="mascot__zzz">
        <text x="162" y="26">z</text>
        <text x="174" y="14">z</text>
        <text x="186" y="4">z</text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import type { MascotAction, MascotMood } from '@/composables/useMascot'
import { prefersReducedMotion } from '@/utils/motion'

const props = withDefaults(
  defineProps<{
    mood?: MascotMood
    /** Куда смотрят глаза по горизонтали: -1 (влево) … 1 (вправо) */
    look?: number
    action?: MascotAction | null
    message?: string | null
  }>(),
  { mood: 'idle', look: 0 },
)

// Несколько маскотов на странице — у каждого свои id градиента и маски
const uid = useId()
const glowId = `mascot-glow-${uid}`
const screenClipId = `mascot-screen-${uid}`
const reducedMotion = prefersReducedMotion()

// Следит за вводом: глаза смещаются вслед за текстом и чуть вниз — на поле
const eyesStyle = computed(() =>
  props.mood === 'watching' ? { transform: `translate(${props.look * 9}px, 5px)` } : undefined,
)
</script>

<style scoped src="./AppMascot.css"></style>
