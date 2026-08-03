import { ref, watch, type Ref } from 'vue'
import { dialogTableMaxHeight } from '@/lib/tableLayout'

/** 弹窗内表格的 max-height（口径见 lib/tableLayout.dialogTableMaxHeight）。
 *
 *  为什么要 watch 而不是 setup 里算一次:el-dialog 默认 destroy-on-close=false,弹窗组件首次
 *  挂载后就常驻,setup 不会重跑 —— 用户 resize 浏览器(或笔记本外接显示器切换)之后再打开弹窗,
 *  拿到的会是过期的视口高。改在每次【打开】时重算,代价是一次乘法。 */
export function useDialogTableHeight(open: Ref<boolean> | (() => boolean)) {
  const h = ref(dialogTableMaxHeight())
  watch(typeof open === 'function' ? open : () => open.value, (v) => {
    if (v) h.value = dialogTableMaxHeight()
  })
  return h
}
