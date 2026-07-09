<script setup lang="ts">
// A colour picker used everywhere a colour is chosen: text, headings, highlight, pens,
// diagrams, callouts. It offers the saved palette, recent choices, a broad spectrum, a
// full colour wheel, and a hex field, so any colour is reachable in a tap or two.
import { ref } from 'vue'
import { pickerRows } from './colors'
import { useSettings } from '@/store/settings'
import Icon from './Icon.vue'

const props = defineProps<{ modelValue: string; allowClear?: boolean; label?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'clear'): void }>()

const settings = useSettings()
const hex = ref(props.modelValue)

function choose(color: string) {
  hex.value = color
  settings.rememberColor(color)
  emit('update:modelValue', color)
}

function onHexInput(value: string) {
  hex.value = value
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) emit('update:modelValue', value)
}

const rows = () => pickerRows(settings.penColors, settings.recentColors)
</script>

<template>
  <div class="picker">
    <p v-if="label" class="label">{{ label }}</p>

    <div v-if="rows().recent.length" class="group">
      <span class="group-label">Recent</span>
      <div class="swatches">
        <button
          v-for="c in rows().recent"
          :key="`r-${c}`"
          class="swatch"
          :class="{ on: c.toLowerCase() === modelValue.toLowerCase() }"
          :style="{ background: c }"
          :title="c"
          @click="choose(c)"
        />
      </div>
    </div>

    <div class="group">
      <span class="group-label">Palette</span>
      <div class="swatches">
        <button
          v-for="c in rows().saved"
          :key="`s-${c}`"
          class="swatch"
          :class="{ on: c.toLowerCase() === modelValue.toLowerCase() }"
          :style="{ background: c }"
          :title="c"
          @click="choose(c)"
        />
        <button class="swatch add" title="Save current colour" @click="settings.savePaletteColor(modelValue)">
          <Icon name="plus" :size="13" />
        </button>
      </div>
    </div>

    <div class="group">
      <span class="group-label">Spectrum</span>
      <div class="swatches">
        <button
          v-for="c in rows().spectrum"
          :key="`p-${c}`"
          class="swatch"
          :class="{ on: c.toLowerCase() === modelValue.toLowerCase(), light: c.toLowerCase() === '#ffffff' }"
          :style="{ background: c }"
          :title="c"
          @click="choose(c)"
        />
      </div>
    </div>

    <div class="custom">
      <label class="wheel" :style="{ background: modelValue }">
        <input type="color" :value="modelValue" @input="choose(($event.target as HTMLInputElement).value)" />
      </label>
      <div class="hex">
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
  </div>
</template>

<style scoped>
.picker {
  width: 232px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #6a6a80;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.group-label {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9a9aa8;
}
.swatches {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 5px;
}
.swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(51, 51, 76, 0.14);
  transition: transform 0.08s ease;
}
.swatch:hover {
  transform: scale(1.12);
}
.swatch.on {
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 3.5px #4a72b0;
}
.swatch.light {
  box-shadow: inset 0 0 0 1px rgba(51, 51, 76, 0.3);
}
.swatch.add {
  display: grid;
  place-items: center;
  background: #fff;
  color: #6a6a80;
  box-shadow: inset 0 0 0 1px rgba(51, 51, 76, 0.25);
}
.custom {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid rgba(51, 51, 76, 0.1);
}
.wheel {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(51, 51, 76, 0.2);
  cursor: pointer;
  overflow: hidden;
}
.wheel input {
  position: absolute;
  inset: -4px;
  width: 40px;
  height: 40px;
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}
.hex {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid rgba(51, 51, 76, 0.18);
  color: #6a6a80;
  font-size: 13px;
}
.hex input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 13px;
  color: #33334c;
  text-transform: uppercase;
  font-family: inherit;
}
.clear {
  border: none;
  background: transparent;
  color: #b73b3a;
  font-size: 12px;
  cursor: pointer;
}
</style>
