<script setup lang="ts">
// A full colour picker used everywhere a colour is chosen: text, headings, highlight,
// pens, diagrams, callouts. It has a saturation and brightness field, a hue slider, a
// hex box, and the saved and sample swatches, so any colour is reachable and the
// familiar note colours are one tap away.
import { onMounted, ref, watch } from 'vue'
import { pickerRows } from './colors'
import { useSettings } from '@/store/settings'
import Icon from './Icon.vue'

const props = defineProps<{ modelValue: string; allowClear?: boolean; label?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'clear'): void }>()

const settings = useSettings()

const hue = ref(210)
const sat = ref(0.5)
const val = ref(0.7)
const hex = ref(props.modelValue)

function clamp(n: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, n))
}
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}
function hexToHsv(input: string) {
  const clean = input.replace('#', '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(clean)) return null
  const full = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function syncFromHex(value: string) {
  const hsv = hexToHsv(value)
  if (hsv) {
    hue.value = hsv.h
    sat.value = hsv.s
    val.value = hsv.v
  }
}
onMounted(() => syncFromHex(props.modelValue))
watch(
  () => props.modelValue,
  (v) => {
    if (v.toLowerCase() !== hex.value.toLowerCase()) {
      hex.value = v
      syncFromHex(v)
    }
  },
)

function emitCurrent() {
  const value = hsvToHex(hue.value, sat.value, val.value)
  hex.value = value
  settings.rememberColor(value)
  emit('update:modelValue', value)
}

const field = ref<HTMLElement | null>(null)
const hueBar = ref<HTMLElement | null>(null)

function pointFromField(event: PointerEvent) {
  const rect = field.value!.getBoundingClientRect()
  sat.value = clamp((event.clientX - rect.left) / rect.width)
  val.value = clamp(1 - (event.clientY - rect.top) / rect.height)
  emitCurrent()
}
function pointFromHue(event: PointerEvent) {
  const rect = hueBar.value!.getBoundingClientRect()
  hue.value = clamp((event.clientX - rect.left) / rect.width) * 360
  emitCurrent()
}
function drag(el: HTMLElement | null, move: (e: PointerEvent) => void, event: PointerEvent) {
  if (!el) return
  el.setPointerCapture(event.pointerId)
  move(event)
  const onMove = (e: PointerEvent) => move(e)
  const stop = () => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', stop)
  }
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', stop)
}

function chooseSwatch(color: string) {
  hex.value = color
  syncFromHex(color)
  settings.rememberColor(color)
  emit('update:modelValue', color)
}
function onHexInput(value: string) {
  hex.value = value
  const hsv = hexToHsv(value)
  if (hsv) {
    hue.value = hsv.h
    sat.value = hsv.s
    val.value = hsv.v
    settings.rememberColor(value)
    emit('update:modelValue', value)
  }
}
const rows = () => pickerRows(settings.penColors, settings.recentColors)
</script>

<template>
  <div class="picker" @mousedown.prevent>
    <p v-if="label" class="label">{{ label }}</p>

    <div
      ref="field"
      class="field"
      :style="{ background: `hsl(${hue}, 100%, 50%)` }"
      @pointerdown="drag(field, pointFromField, $event)"
    >
      <div class="field-white" />
      <div class="field-black" />
      <div class="thumb" :style="{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%`, background: hex }" />
    </div>

    <div ref="hueBar" class="hue" @pointerdown="drag(hueBar, pointFromHue, $event)">
      <div class="hue-thumb" :style="{ left: `${(hue / 360) * 100}%` }" />
    </div>

    <div class="current">
      <span class="chip" :style="{ background: hex }" />
      <div class="hexbox">
        <span>#</span>
        <input
          :value="hex.replace('#', '')"
          maxlength="6"
          spellcheck="false"
          @input="onHexInput('#' + ($event.target as HTMLInputElement).value)"
        />
      </div>
      <button v-if="allowClear" class="clear" @click="emit('clear')">Clear</button>
    </div>

    <div class="swatches">
      <button
        v-for="c in [...rows().saved, ...rows().recent]"
        :key="c"
        class="swatch"
        :class="{ on: c.toLowerCase() === modelValue.toLowerCase(), light: c.toLowerCase() === '#ffffff' }"
        :style="{ background: c }"
        :title="c"
        @click="chooseSwatch(c)"
      />
      <button class="swatch add" title="Save this colour" @click="settings.savePaletteColor(hex)">
        <Icon name="plus" :size="12" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker {
  width: 236px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  user-select: none;
}
.label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-soft);
}
.field {
  position: relative;
  width: 100%;
  height: 132px;
  border-radius: 10px;
  cursor: crosshair;
  touch-action: none;
  overflow: hidden;
}
.field-white,
.field-black {
  position: absolute;
  inset: 0;
}
.field-white {
  background: linear-gradient(to right, #fff, transparent);
}
.field-black {
  background: linear-gradient(to top, #000, transparent);
}
.thumb {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow:
    0 0 0 2px #fff,
    0 1px 3px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}
.hue {
  position: relative;
  height: 14px;
  border-radius: 7px;
  cursor: pointer;
  touch-action: none;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}
.hue-thumb {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.15),
    0 1px 3px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.current {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chip {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px var(--border);
}
.hexbox {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  padding: 6px 9px;
  border-radius: 8px;
  border: 1px solid var(--border);
  color: var(--text-soft);
  font-size: 13px;
}
.hexbox input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--text);
  text-transform: uppercase;
  font-family: inherit;
  background: transparent;
}
.clear {
  border: none;
  background: transparent;
  color: var(--danger);
  font-size: 12px;
  cursor: pointer;
}
.swatches {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 5px;
}
.swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--border);
  transition: transform 0.08s ease;
}
.swatch:hover {
  transform: scale(1.12);
}
.swatch.on {
  box-shadow:
    0 0 0 2px var(--surface),
    0 0 0 3.5px var(--accent);
}
.swatch.light {
  box-shadow: inset 0 0 0 1px var(--border);
}
.swatch.add {
  display: grid;
  place-items: center;
  background: var(--surface-2);
  color: var(--text-soft);
}

@media (max-width: 720px) {
  .picker {
    width: 100%;
    max-width: 100%;
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
    gap: 12px;
  }
  .field {
    height: 160px;
  }
  .hue {
    height: 20px;
    border-radius: 10px;
  }
  .swatches {
    gap: 8px;
  }
  .clear {
    min-height: 44px;
    padding: 0 8px;
  }
}
</style>
