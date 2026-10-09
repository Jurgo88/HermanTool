<!-- C-24 (FR-26, S-20; design foundation §6). A4 pages of AssetTag labels:
  QR, tag code and AssetType name, 3 × 7 per page, dashed edges to cut
  along. The grid is the --ht-label-* tokens, the page the named @page in
  print.css; app/utils/asset-tag-sheet.ts holds the per-page count. The
  QR encodes the opaque tag code only, never an Asset id or a URL (FR-26). -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import { chunkIntoSheets } from '~/utils/asset-tag-sheet'

export interface AssetTagSheetEntry {
  assetId: number
  tagCode: string
  qrDataUrl: string
  assetTypeName: string
}

const props = defineProps<{ entries: AssetTagSheetEntry[] }>()

const sheets = computed(() => chunkIntoSheets(props.entries))
</script>

<template>
  <div class="asset-tag-sheets">
    <section
      v-for="(sheet, index) in sheets"
      :key="index"
      class="asset-tag-sheet"
      :aria-label="
        sk.assetTagSheet.sheetLabel
          .replace('{page}', String(index + 1))
          .replace('{pages}', String(sheets.length))
      "
    >
      <figure v-for="entry in sheet" :key="entry.assetId" class="asset-tag">
        <img :src="entry.qrDataUrl" :alt="entry.tagCode" />
        <figcaption class="asset-tag__text">
          <span class="asset-tag__code">{{ entry.tagCode }}</span>
          <span class="asset-tag__name">{{ entry.assetTypeName }}</span>
        </figcaption>
      </figure>
    </section>
  </div>
</template>

<style scoped>
.asset-tag-sheets {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
}

.asset-tag-sheet {
  display: grid;
  grid-template-columns: repeat(var(--ht-label-columns), var(--ht-label-width));
  grid-auto-rows: var(--ht-label-height);
  column-gap: var(--ht-label-gap-x);
  justify-content: start;
  padding: var(--ht-space-4);
  background: var(--ht-surface);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  overflow-x: auto;
}

.asset-tag {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ht-space-2);
  padding: var(--ht-space-2);
  border: 1px dashed var(--ht-line-strong);
  box-sizing: border-box;
  overflow: hidden;
  break-inside: avoid;
}

.asset-tag img {
  flex: none;
  width: var(--ht-label-qr);
  height: var(--ht-label-qr);
}

.asset-tag__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-1);
}

.asset-tag__code {
  font-family: var(--ht-font-mono);
  font-weight: 600;
  font-size: var(--ht-text-2);
}

.asset-tag__name {
  font-size: var(--ht-text-1);
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media print {
  .asset-tag-sheets {
    gap: 0;
  }

  /* One named A4 page per sheet; the margins are in print.css. */
  .asset-tag-sheet {
    page: labels;
    break-after: page;
    padding: 0;
    border: 0;
    border-radius: 0;
    overflow: visible;
  }

  .asset-tag-sheet:last-child {
    break-after: auto;
  }
}
</style>
