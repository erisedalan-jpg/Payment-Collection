<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useFilterStore } from '@/stores/filter'

const projectTags = useProjectTagsStore()
const filter = useFilterStore()

const newTag = ref('')
function onAddTag() { const n = newTag.value.trim(); if (n) { projectTags.addTag(n); projectTags.save(); newTag.value = '' } }
function onRename(oldN: string, e: Event) { const v = (e.target as HTMLInputElement).value.trim(); if (v && v !== oldN) { projectTags.renameTag(oldN, v); projectTags.save() } }
function onDisable(name: string, on: boolean) { projectTags.disableTag(name, on); projectTags.save() }

const excludeOn = computed({ get: () => filter.excludeOn, set: (v: boolean) => filter.setExclude(v, filter.excludeTags) })
const excludeTags = computed({ get: () => filter.excludeTags, set: (v: string[]) => filter.setExclude(filter.excludeOn, v) })

onMounted(() => { if (!projectTags.loaded) projectTags.load() })
</script>

<template>
  <div class="dv-card">
    <div class="dv-card-head">项目标签</div>
    <div class="dv-row dv-tags-mgr">
      <span class="dv-label">标签库</span>
      <span v-for="t in projectTags.tags" :key="t.name" class="dv-tag" :class="{ off: t.disabled }">
        <input class="dv-tag-name" :value="t.name" @change="onRename(t.name, $event)" />
        <el-switch :model-value="!t.disabled" size="small" @update:model-value="(v: boolean) => onDisable(t.name, !v)" />
      </span>
      <el-input v-model="newTag" size="small" placeholder="新标签" style="width: 120px" @keyup.enter="onAddTag" />
      <button class="dv-btn" @click="onAddTag">添加</button>
    </div>
    <div class="dv-row">
      <span class="dv-label">按标签排除</span>
      <el-switch v-model="excludeOn" />
      <el-select v-model="excludeTags" size="small" multiple collapse-tags clearable placeholder="选要排除的标签" style="width: 220px">
        <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
      </el-select>
      <span class="dv-hint">开启后，挂有所选标签的项目从所有看板隐藏（替代旧纳管）</span>
    </div>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:标签 chip */
.dv-tags-mgr { flex-wrap: wrap; gap: var(--sp-2); }
.dv-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 1px solid var(--line); border-radius: var(--r-sm); }
.dv-tag.off { opacity: .5; }
.dv-tag-name { width: 84px; border: none; background: transparent; color: var(--txt); font-size: var(--fs-1); }
</style>
