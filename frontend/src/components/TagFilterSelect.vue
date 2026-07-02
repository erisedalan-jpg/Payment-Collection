<script setup lang="ts">
import { computed } from 'vue'
import { useProjectTagsStore } from '@/stores/projectTags'
import { tagFilterOptions } from '@/lib/tagFilter'

const model = defineModel<string[]>({ default: () => [] })
const tags = useProjectTagsStore()
const options = computed(() => tagFilterOptions(tags.activeTags))
</script>

<template>
  <el-select v-model="model" multiple collapse-tags clearable placeholder="标签筛选"
    size="small" style="min-width: 160px" data-test="tag-filter">
    <el-option v-for="o in options" :key="o.value" :label="o.label" :value="o.value" />
  </el-select>
</template>
