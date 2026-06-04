<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { pmRanking, pmDrilldown } from '@/lib/pmView'
import PmRankingTable from '@/components/PmRankingTable.vue'
import PmDrilldownModal from '@/components/PmDrilldownModal.vue'

const data = useDataStore()
const filter = useFilterStore()

onMounted(() => {
  if (!data.data) data.load()
})

const search = ref('')
const expandedName = ref('')

const rawNodes = computed(() => (data.data?.rawNodes ?? []) as Record<string, any>[])
const ranking = computed(() => pmRanking(rawNodes.value as any, search.value))
const drill = computed(() =>
  expandedName.value
    ? pmDrilldown(
        rawNodes.value as any,
        expandedName.value,
        filter.naguanOn,
        (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
      )
    : { projects: [], delayedNodes: [] },
)
const modalOpen = computed({
  get: () => expandedName.value !== '',
  set: (v: boolean) => {
    if (!v) expandedName.value = ''
  },
})
function onSelect(name: string) {
  expandedName.value = expandedName.value === name ? '' : name
}
</script>

<template>
  <div class="pm-view">
    <h2 class="pm-title">项目经理视图</h2>
    <div class="toolbar">
      <el-input v-model="search" size="small" placeholder="搜索项目经理..." clearable style="width: 300px" />
    </div>
    <PmRankingTable :rows="ranking" :expanded="expandedName" @select="onSelect" />
    <PmDrilldownModal
      v-model="modalOpen"
      :pm-name="expandedName"
      :projects="drill.projects as Record<string, any>[]"
      :delayed-nodes="drill.delayedNodes as Record<string, any>[]"
    />
  </div>
</template>

<style scoped>
.pm-view { padding: 16px; }
.pm-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 14px; }
.toolbar { margin-bottom: 12px; }
</style>
