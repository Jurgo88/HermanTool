<!-- C-10 (D-45; docs/design/interface-design-foundation.md §3, §5). Camera
  first via BarcodeDetector, typed field as the permanent fallback for a
  damaged tag, a dead camera, or a denied permission. Emits the same
  `scan` event either way — the caller (counter.vue) sends it to
  POST /api/handover/scan unchanged (FR-17: the domain resolves it). -->
<script setup lang="ts">
type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'error'

const emit = defineEmits<{ scan: [tagCode: string] }>()

const cameraState = ref<CameraState>('idle')
const manualCode = ref('')
const videoRef = ref<HTMLVideoElement | null>(null)

let stream: MediaStream | null = null
let detector: BarcodeDetector | null = null
let rafId: number | null = null

function stopCamera() {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
}

async function scanLoop() {
  if (!videoRef.value || !detector) return
  try {
    const codes = await detector.detect(videoRef.value)
    if (codes.length > 0) {
      emit('scan', codes[0]!.rawValue)
      stopCamera()
      cameraState.value = 'idle'
      return
    }
  } catch {
    // A frame with nothing decodable throws on some implementations —
    // expected on most frames, not a failure worth surfacing.
  }
  rafId = requestAnimationFrame(scanLoop)
}

async function startCamera() {
  if (typeof window === 'undefined' || !window.BarcodeDetector) {
    cameraState.value = 'unsupported'
    return
  }
  cameraState.value = 'requesting'
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    if (!videoRef.value) throw new Error('video element not mounted')
    videoRef.value.srcObject = stream
    await videoRef.value.play()
    detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    cameraState.value = 'active'
    scanLoop()
  } catch {
    cameraState.value = 'denied'
  }
}

function submitManual() {
  const code = manualCode.value.trim()
  if (!code) return
  emit('scan', code)
  manualCode.value = ''
}

onMounted(startCamera)
onBeforeUnmount(stopCamera)

defineExpose({ retry: startCamera })
</script>

<template>
  <div class="scan-target">
    <div v-if="cameraState === 'active' || cameraState === 'requesting'" class="scan-target__plate">
      <video ref="videoRef" class="scan-target__video" muted playsinline></video>
      <span class="scan-target__corner scan-target__corner--tl"></span>
      <span class="scan-target__corner scan-target__corner--tr"></span>
      <span class="scan-target__corner scan-target__corner--bl"></span>
      <span class="scan-target__corner scan-target__corner--br"></span>
      <span v-if="cameraState === 'active'" class="scan-target__hint">
        <slot name="hint">Namierte na štítok</slot>
      </span>
    </div>
    <p v-else-if="cameraState === 'denied'" role="alert">
      <slot name="denied">Prístup ku kamere nie je možný. Zadajte kód štítku ručne.</slot>
    </p>
    <p v-else-if="cameraState === 'unsupported'">
      <slot name="unsupported">Tento prehliadač nepodporuje skenovanie kamerou. Zadajte kód štítku ručne.</slot>
    </p>

    <form class="scan-target__manual" @submit.prevent="submitManual">
      <label>
        <slot name="manual-label">Kód štítku (ručne)</slot>
        <input v-model="manualCode" type="text" autocomplete="off" />
      </label>
      <AppButton type="submit" variant="secondary" size="counter">
        <slot name="manual-action">Potvrdiť</slot>
      </AppButton>
    </form>
  </div>
</template>

<style scoped>
.scan-target__plate {
  position: relative;
  border: 2px solid var(--ht-signal);
  border-radius: var(--ht-radius-plate);
  height: 190px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ht-surface-sunk);
}

.scan-target__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scan-target__corner {
  position: absolute;
  width: 26px;
  height: 26px;
  border: 3px solid var(--ht-signal);
}

.scan-target__corner--tl {
  top: 10px;
  left: 10px;
  border-right: 0;
  border-bottom: 0;
}

.scan-target__corner--tr {
  top: 10px;
  right: 10px;
  border-left: 0;
  border-bottom: 0;
}

.scan-target__corner--bl {
  bottom: 10px;
  left: 10px;
  border-right: 0;
  border-top: 0;
}

.scan-target__corner--br {
  bottom: 10px;
  right: 10px;
  border-left: 0;
  border-top: 0;
}

.scan-target__hint {
  position: relative;
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-3);
  color: #fff;
  text-shadow: 0 1px 3px rgb(0 0 0 / 60%);
}

.scan-target__manual {
  display: flex;
  align-items: flex-end;
  gap: var(--ht-space-3);
  margin-top: var(--ht-space-3);
}
</style>
