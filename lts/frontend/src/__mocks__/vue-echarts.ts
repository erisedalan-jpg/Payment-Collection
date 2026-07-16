// 测试专用桩：替换 vue-echarts，避免在 jsdom 中加载真实 ECharts（无 Canvas）。
// 仅经 vite.config.ts 的 test.alias 在测试环境生效。渲染 .vchart-stub 便于断言 option 转发。

import { defineComponent, h } from 'vue'
const VChart = defineComponent({
  name: 'VChart',
  props: ['option', 'theme', 'autoresize'],
  setup(props) {
    return () => h('div', { class: 'vchart-stub' }, Object.keys(props.option || {}).join(','))
  },
})

export default VChart
