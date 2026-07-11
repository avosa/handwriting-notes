<script setup lang="ts">
// A picture placed in the writing column. It loads its bytes from local storage into an
// object URL for as long as it is on screen, and releases the URL when it leaves so nothing
// is held longer than it is shown. The picture fits the column width and stands as many
// ruled lines tall as the block asks.
import { onBeforeUnmount, ref, watch } from 'vue'
import { getBlob } from '@/store/persistence'

const props = defineProps<{ blobRef: string; alt?: string }>()

const src = ref('')

async function load(ref_: string) {
  release()
  const blob = await getBlob(ref_)
  if (blob) src.value = URL.createObjectURL(blob)
}
function release() {
  if (src.value) {
    URL.revokeObjectURL(src.value)
    src.value = ''
  }
}

watch(() => props.blobRef, load, { immediate: true })
onBeforeUnmount(release)
</script>

<template>
  <img v-if="src" :src="src" :alt="alt ?? ''" class="image" draggable="false" />
  <div v-else class="image-missing">Picture not found</div>
</template>

<style scoped>
.image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.image-missing {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 13px;
  opacity: 0.5;
}
</style>
