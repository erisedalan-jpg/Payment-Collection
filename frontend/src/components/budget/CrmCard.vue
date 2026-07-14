<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { InputInstance } from 'element-plus'
import { useBudgetStore } from '@/stores/budget'

/** CRM 审批建议：这段文字是要整段复制进 CRM 走审批的，所以默认以**只读原文**呈现
 *  （所见即所贴，换行不被输入框裁掉），点「编辑」或点正文才切到 textarea 手改。
 *
 *  ★手改后就不再被表单变动自动覆盖（原工具同样行为）——但原工具**没有回头路**：
 *   改了一次就永远回不到自动版本。右上角的「恢复自动生成」就是补的这条回头路。
 */
const store = useBudgetStore()

const editing = ref(false)
const taRef = ref<InputInstance>()

async function startEdit(): Promise<void> {
  editing.value = true
  await nextTick()
  taRef.value?.focus()
}

/** 手改一次就打上标记 —— 之后 syncCrmText() 不再覆盖用户的文字。 */
function onInput(): void {
  store.form.crmUserEdited = true
  store.touch()
}

/** 清掉手改标记并按当前表单重新生成。 */
function restore(): void {
  store.restoreCrmAuto()
}

defineExpose({ editing, startEdit, restore })
</script>

<template>
  <section class="bd-card">
    <div class="crm-head">
      <h3 class="bd-card-title">CRM 审批建议</h3>
      <div class="crm-ops">
        <span v-if="store.form.crmUserEdited" class="crm-flag">已手改，不再自动更新</span>
        <el-button v-if="!editing" size="small" @click="startEdit">编辑</el-button>
        <el-button v-else size="small" @click="editing = false">完成编辑</el-button>
        <el-button
          size="small"
          :disabled="!store.form.crmUserEdited"
          @click="restore"
        >
          恢复自动生成
        </el-button>
      </div>
    </div>

    <el-input
      v-if="editing"
      ref="taRef"
      v-model="store.form.crmText"
      type="textarea"
      :rows="6"
      placeholder="随表单自动生成；手改后不再自动更新"
      @input="onInput"
    />
    <pre v-else class="crm-text" @click="startEdit">{{ store.form.crmText }}</pre>

    <p class="crm-hint">整段复制进 CRM 走审批。手改后不再随表单自动更新，可点「恢复自动生成」取回自动版本。</p>
  </section>
</template>

<style scoped>
.bd-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}
.bd-card-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); line-height: var(--lh-dense); }
.crm-head { display: flex; align-items: center; justify-content: space-between; gap: var(--gap-card); flex-wrap: wrap; }
.crm-ops { display: flex; align-items: center; gap: var(--sp-2); }
.crm-flag {
  font-size: var(--fs-1);
  font-weight: 700;
  line-height: var(--lh-dense);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-sm);
  background: var(--warn-bg);
  color: var(--warn-text);
}

.crm-text {
  margin: 0;
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--card2);
  font-family: var(--font-sans);
  font-size: var(--fs-2);
  color: var(--txt);
  line-height: var(--lh-base);
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 96px;
  cursor: text;
  transition: background var(--dur-1) var(--ease);
}
.crm-text:hover { background: var(--hover-tint); }

.crm-hint { font-size: var(--fs-1); color: var(--mut); line-height: var(--lh-dense); }
</style>
