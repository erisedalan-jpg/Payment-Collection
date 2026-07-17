<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { api } from '@/api/client'
import { pingAgent } from '@/lib/cookieAgent'
import { useReprocess } from '@/composables/useReprocess'
import DataStatusBar from '@/components/DataStatusBar.vue'
import MainDomainSourceCard from '@/components/MainDomainSourceCard.vue'
import YitianSourceCard from '@/components/YitianSourceCard.vue'
import ProjectTagsCard from '@/components/ProjectTagsCard.vue'
import PortalConfigCard from '@/components/PortalConfigCard.vue'
import YitianScopeCard from '@/components/YitianScopeCard.vue'
import YitianRulesCard from '@/components/YitianRulesCard.vue'
import MaintenanceCard from '@/components/MaintenanceCard.vue'
import { useAuthStore } from '@/stores/auth'

const data = useDataStore()
const projectTags = useProjectTagsStore()
const auth = useAuthStore()

// tab 不持久化:每次进入默认落「数据源」签(更新数据已常驻,签只在偶尔改配置/回滚时才切)
const activeTab = ref('sources')

const mainCard = ref<InstanceType<typeof MainDomainSourceCard> | null>(null)
const yitianCard = ref<InstanceType<typeof YitianSourceCard> | null>(null)
const dlRunning = ref(false)

const lastUpdate = computed(() => (data.data?.meta as any)?.lastUpdate || '-')
const lastPmis = computed(() => (data.data as any)?.dataQuality?.summary?.lastPmisUpdate || '-')

// —— 更新数据 / 设置 ——
const { progress: repProgress, message: repMessage, running: repRunning, start: startReprocess } =
  useReprocess({ onDone: () => { data.reload(); mainCard.value?.reload(); yitianCard.value?.reload(); projectTags.load() } })

// —— PMIS 在线下载 ——
const cookieStatus = ref<{ sessionPreview: string; updatedAt: string }>({ sessionPreview: '', updatedAt: '' })
const agentOnline = ref(false)
const yitianStatus = ref<{ sessionPreview: string; updatedAt: string }>({ sessionPreview: '', updatedAt: '' })

async function checkAgent() {
  agentOnline.value = await pingAgent()
}
async function loadYitianStatus() {
  try { yitianStatus.value = await api.get('/api/yitian/cookie') } catch { /* 未登录/缺接口静默 */ }
}

async function loadCookieStatus() {
  try { cookieStatus.value = await api.get('/api/pmis/cookie') } catch { /* 未登录/缺接口静默 */ }
}

function reloadSources() { mainCard.value?.reload(); yitianCard.value?.reload() }

onMounted(() => { if (!data.data) data.load(); if (!projectTags.loaded) projectTags.load(); loadCookieStatus() })
onMounted(() => { checkAgent(); loadYitianStatus() })
defineExpose({
  onFetchPmisCookie: () => mainCard.value?.onFetchPmisCookie(),
  onFetchYitianCookie: () => yitianCard.value?.onFetchYitianCookie(),
  checkAgent,
})
</script>

<template>
  <div class="data-view">
    <div class="dv-top">
      <h2 class="dv-title">数据管理</h2>
    </div>

    <DataStatusBar :last-update="lastUpdate" :last-pmis="lastPmis" :agent-online="agentOnline"
      :cookie-status="cookieStatus" :yitian-status="yitianStatus" />

    <!-- 主操作:更新看板 -->
    <div class="dv-card dv-primary">
      <div class="dv-card-head">更新看板</div>
      <div class="dv-row dv-hint">
        两种方式二选一：从 PMIS 在线抓取覆盖 input/，或手动上传文件到 input/（PMIS 九表放
        <b>input/pmis/</b>，其余 CSV/xlsx（含核心回款源 collection_stages.csv）放 <b>input/</b> 根）；获取后点「更新数据」生效。
      </div>
      <div class="dv-row">
        <button class="dv-btn primary dv-btn-lg" :disabled="repRunning || dlRunning" @click="startReprocess()">更新数据（重新处理）</button>
        <span class="dv-hint">读取已获取数据重算看板</span>
      </div>
      <div v-if="repRunning || repProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: repProgress + '%' }"></div></div><div class="dv-msg">{{ repMessage }}</div></div>
    </div>

    <el-tabs v-model="activeTab" class="dv-tabs">
      <!-- 注意:绝不给 el-tab-pane 设 lazy(EP 2.14.1 默认 false=全渲染+v-show 隐藏);
           一旦设 lazy,现有 data-test 查询与冷加载行为同时改变。 -->
      <el-tab-pane label="数据源" name="sources">
        <div class="dv-pane-grid">
          <MainDomainSourceCard ref="mainCard" :rep-running="repRunning"
            @cookie-change="(v) => cookieStatus = v"
            @download-done="loadCookieStatus"
            @running-change="(v: boolean) => dlRunning = v" />

          <YitianSourceCard ref="yitianCard" :yitian-status="yitianStatus"
            @cookie-change="(v) => yitianStatus = v" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="配置" name="config">
        <div class="dv-pane-grid">
          <ProjectTagsCard />

          <div v-if="auth.isSuper" class="dv-card">
            <div class="dv-card-head">倚天合规</div>
            <el-collapse class="dv-more">
              <el-collapse-item name="yitian-scope" title="合规检查范围（超管）">
                <YitianScopeCard />
              </el-collapse-item>
              <el-collapse-item name="yitian-rules" title="合规规则配置（超管）">
                <YitianRulesCard />
              </el-collapse-item>
            </el-collapse>
          </div>

          <div v-if="auth.isSuper" class="dv-card dv-span-all">
            <div class="dv-card-head">首页门户</div>
            <el-collapse class="dv-more">
              <el-collapse-item name="portal" title="首页门户 / 快捷入口">
                <PortalConfigCard />
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="维护" name="maint">
        <MaintenanceCard @data-changed="reloadSources" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

.data-view { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--gap-card); }
.dv-top { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-2); }
.dv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }

/* 主操作:更新看板,提为显眼主操作区(色调+更粗边框,不引入新色号) */
.dv-primary {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  background: color-mix(in srgb, var(--accent) 5%, var(--card));
  box-shadow: var(--shadow-2);
}
.dv-primary .dv-card-head { color: var(--accent); border-bottom-color: color-mix(in srgb, var(--accent) 25%, var(--line)); }

/* 显式两栏:卡的位置由设计决定,不由浏览器宽度决定(旧 auto-fit 让 5 张高度差 4~5 倍的卡排出参差) */
.dv-pane-grid {
  display: grid;
  gap: var(--gap-card);
  grid-template-columns: 1fr 1fr;
  align-items: start;
}
.dv-span-all { grid-column: 1 / -1; }
@media (max-width: 768px) { .dv-pane-grid { grid-template-columns: 1fr; } }
.dv-tabs :deep(.el-tabs__item) { font-size: var(--fs-2); font-weight: 700; }
.dv-tabs :deep(.el-tabs__content) { padding-top: var(--gap-section); }
</style>
