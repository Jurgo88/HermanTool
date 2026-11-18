<script setup lang="ts">
// S-01 AI tool recommendation (D-64; issue #214). Above the catalog grid;
// the D-54 filters stay alongside. The browser only sends the question and
// shows what the server returned: the server picked and validated the
// AssetTypes (D-25). No availability here (D-58) — each card links to S-02.
//
// Four states on the one mutating control: idle, pending, result (with or
// without a match), error. A 503 (cap reached, provider down, switched off)
// hides the input for the rest of the visit: the filters below remain.
import { sk } from '~/i18n/sk'
import { getErrorCode } from '~/utils/error-code'
import type { MonetaryAmountView } from '~/utils/format'
import { TOOL_RECOMMENDATION_MAX_QUESTION_LENGTH } from '#shared/tool-recommendation'

interface RecommendationView {
  assetTypeId: number
  reason: string
  name: string
  dayRate: MonetaryAmountView
  imageFile: string | null
}

interface ResultView {
  matched: boolean
  safetyNote: string | null
  recommendations: RecommendationView[]
}

const max = TOOL_RECOMMENDATION_MAX_QUESTION_LENGTH

const question = ref('')
const state = ref<'idle' | 'pending' | 'result' | 'error' | 'closed'>('idle')
const result = ref<ResultView | null>(null)
const errorMessage = ref<string | null>(null)

const length = computed(() => question.value.trim().length)
const tooLong = computed(() => length.value > max)
const canSubmit = computed(() => length.value > 0 && !tooLong.value && state.value !== 'pending')

async function ask() {
  if (!canSubmit.value) return
  state.value = 'pending'
  errorMessage.value = null
  try {
    result.value = await $fetch<ResultView>('/api/public/tool-recommendation', {
      method: 'POST',
      body: { question: question.value.trim() },
    })
    state.value = 'result'
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode
    const code = getErrorCode(err)
    if (status === 503) {
      errorMessage.value = sk.toolRecommendation.unavailable
      state.value = 'closed'
      return
    }
    if (code === 'VisitorLimitReachedError') {
      const window = (err as { data?: { data?: { window?: string } } })?.data?.data?.window
      errorMessage.value = window === 'day' ? sk.toolRecommendation.limitDay : sk.toolRecommendation.limitHour
    } else {
      errorMessage.value = sk.toolRecommendation.error
    }
    state.value = 'error'
  }
}

function askAgain() {
  result.value = null
  state.value = 'idle'
}
</script>

<template>
  <section class="recommend" aria-labelledby="recommend-heading">
    <h2 id="recommend-heading" class="recommend__heading">{{ sk.toolRecommendation.heading }}</h2>

    <AppAlert v-if="state === 'closed'" :message="errorMessage" />

    <form v-else class="recommend__form" @submit.prevent="ask">
      <AppField
        :label="sk.toolRecommendation.label"
        :hint="sk.toolRecommendation.hint"
        :error="tooLong ? sk.toolRecommendation.tooLong : null"
      >
        <template #default="slotProps">
          <textarea
            :id="slotProps.id"
            v-model="question"
            rows="2"
            :aria-describedby="slotProps.ariaDescribedby"
            :disabled="state === 'pending'"
          />
        </template>
      </AppField>
      <div class="recommend__actions">
        <span class="recommend__counter" :class="{ 'recommend__counter--over': tooLong }" aria-live="polite">
          {{ sk.toolRecommendation.counter.replace('{count}', String(length)).replace('{max}', String(max)) }}
        </span>
        <AppButton type="submit" :pending="state === 'pending'" :disabled="!canSubmit">
          {{ sk.toolRecommendation.submitAction }}
        </AppButton>
      </div>
    </form>

    <p v-if="state === 'pending'" class="recommend__status" role="status" aria-busy="true">
      {{ sk.toolRecommendation.pending }}
    </p>
    <AppAlert v-if="state === 'error'" :message="errorMessage" />

    <div v-if="state === 'result' && result" class="recommend__result" role="status">
      <template v-if="result.matched">
        <h3 class="recommend__result-heading">{{ sk.toolRecommendation.resultHeading }}</h3>
        <ul class="recommend__cards">
          <li v-for="entry in result.recommendations" :key="entry.assetTypeId" class="recommend__card">
            <AssetTypeCard
              :asset-type-id="entry.assetTypeId"
              :name="entry.name"
              :day-rate="entry.dayRate"
              :image-file="entry.imageFile"
            />
            <p class="recommend__reason">{{ entry.reason }}</p>
          </li>
        </ul>
        <p v-if="result.safetyNote" class="recommend__safety">
          <strong>{{ sk.toolRecommendation.safetyLabel }}</strong> {{ result.safetyNote }}
        </p>
      </template>
      <div v-else class="recommend__no-match">
        <p>{{ sk.toolRecommendation.noMatch }}</p>
        <DraftNotice>
          <p>{{ sk.draft.recommendationContact }}</p>
        </DraftNotice>
      </div>
      <p class="recommend__disclaimer">{{ sk.toolRecommendation.disclaimer }}</p>
      <AppButton variant="secondary" @click="askAgain">{{ sk.toolRecommendation.askAgainAction }}</AppButton>
    </div>
  </section>
</template>

<style scoped>
.recommend {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
  padding: var(--ht-space-4);
  border-radius: var(--ht-radius-plate);
  background: var(--ht-surface);
  box-shadow: var(--ht-shadow-card);
}

.recommend__heading {
  margin: 0;
  font-size: var(--ht-text-4);
}

.recommend__form {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.recommend__form textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
}

.recommend__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-3);
}

.recommend__counter {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-1);
}

.recommend__counter--over {
  color: var(--ht-danger);
}

.recommend__status {
  margin: 0;
  color: var(--ht-ink-muted);
}

.recommend__result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-3);
}

.recommend__result-heading {
  margin: 0;
  font-size: var(--ht-text-3);
}

.recommend__cards {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--ht-space-4);
}

.recommend__card {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.recommend__reason,
.recommend__safety,
.recommend__disclaimer {
  margin: 0;
}

.recommend__disclaimer {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-1);
}

.recommend__no-match {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.recommend__no-match p {
  margin: 0;
}
</style>
