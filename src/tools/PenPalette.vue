<script setup lang="ts">
// The editable colour set. A swatch selects the active ink and doubles as a colour
// input, so the same palette drives both the drawing tools and the accents the AI
// uses in generated diagrams.
import { useSettings } from '@/store/settings'

const settings = useSettings()

function onSwatchInput(index: number, event: Event) {
  const value = (event.target as HTMLInputElement).value
  settings.setPaletteColor(index, value)
  settings.selectColor(value)
}
</script>

<template>
  <div class="palette">
    <div
      v-for="(color, i) in settings.penColors"
      :key="i"
      class="swatch"
      :class="{ active: settings.activeColor === color }"
      :style="{ background: color }"
    >
      <button class="pick" :title="color" @click="settings.selectColor(color)"></button>
      <input class="edit" type="color" :value="color" title="Edit colour" @input="onSwatchInput(i, $event)" />
    </div>
    <button
      v-if="settings.penColors.length < 8"
      class="add"
      title="Add a colour"
      @click="settings.addPaletteColor('#4A72B0')"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.palette {
  display: flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(51, 51, 76, 0.2);
}
.swatch.active {
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 3.5px #4a72b0;
}
.swatch .pick {
  position: absolute;
  inset: 0;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
}
.swatch .edit {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 12px;
  height: 12px;
  padding: 0;
  border: none;
  background: transparent;
  opacity: 0;
  cursor: pointer;
}
.add {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px dashed rgba(51, 51, 76, 0.4);
  background: transparent;
  color: #33334c;
  cursor: pointer;
  line-height: 1;
}
</style>
