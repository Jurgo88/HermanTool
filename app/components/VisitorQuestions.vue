<script setup lang="ts">
// S-25 „Čo ľudia hľadali“ (D-64; issue #214). The stored questions from the
// AI recommendation, newest first — kept 90 days, e-mails and phone
// numbers already stripped on the server. A question that found nothing is
// marked: it may show what the offer lacks. Read-only.
import { sk } from '~/i18n/sk'
import { formatDateTime } from '~/utils/format'

interface QuestionView {
  id: number
  questionText: string
  recordedAt: string
  matched: boolean
  recommended: { assetTypeId: number; name: string | null }[]
}

const questions = ref<QuestionView[]>([])
const status = ref<'loading' | 'loaded' | 'error'>('loading')
const onlyUnmatched = ref(false)

onMounted(async () => {
  try {
    questions.value = await $fetch<QuestionView[]>('/api/admin/statistics/visitor-questions')
    status.value = 'loaded'
  } catch {
    status.value = 'error'
  }
})

const shown = computed(() => (onlyUnmatched.value ? questions.value.filter((q) => !q.matched) : questions.value))

const recommendedNames = (question: QuestionView) =>
  sk.adminStatistics.questionsRecommended.replace(
    '{names}',
    question.recommended.map((r) => r.name ?? sk.adminStatistics.questionsUnpublished).join(', '),
  )
</script>

<template>
  <section class="questions" aria-labelledby="statistics-questions-heading">
    <h2 id="statistics-questions-heading" class="questions__heading">{{ sk.adminStatistics.questionsHeading }}</h2>
    <p class="questions__intro">{{ sk.adminStatistics.questionsIntro }}</p>

    <p v-if="status === 'loading'" aria-busy="true">{{ sk.adminStatistics.questionsLoading }}</p>
    <AppAlert v-else-if="status === 'error'" :message="sk.adminStatistics.questionsLoadError" />
    <template v-else>
      <label class="questions__filter">
        <input v-model="onlyUnmatched" type="checkbox" />
        {{ sk.adminStatistics.questionsOnlyUnmatched }}
      </label>
      <EmptyState v-if="shown.length === 0" :message="sk.adminStatistics.questionsEmpty" />
      <ul v-else class="questions__list">
        <li
          v-for="question in shown"
          :key="question.id"
          class="questions__entry"
          :class="{ 'questions__entry--unmatched': !question.matched }"
        >
          <p class="questions__text">{{ question.questionText }}</p>
          <p class="questions__meta">
            <time :datetime="question.recordedAt">{{ formatDateTime(question.recordedAt) }}</time>
            ·
            <strong v-if="!question.matched">{{ sk.adminStatistics.questionsUnmatched }}</strong>
            <span v-else>{{ recommendedNames(question) }}</span>
          </p>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.questions {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.questions__heading {
  margin: 0;
  font-size: var(--ht-text-4);
}

.questions__intro {
  margin: 0;
  color: var(--ht-ink-muted);
}

.questions__filter {
  display: flex;
  align-items: center;
  gap: var(--ht-space-2);
}

.questions__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.questions__entry {
  padding: var(--ht-space-3);
  background: var(--ht-surface);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
}

.questions__entry--unmatched {
  border-color: var(--ht-warn);
}

.questions__text,
.questions__meta {
  margin: 0;
}

.questions__meta {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-1);
}
</style>
