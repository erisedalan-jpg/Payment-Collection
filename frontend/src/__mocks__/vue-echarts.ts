import { defineComponent, h } from 'vue'

// Test stub for vue-echarts — avoids real ECharts canvas init in jsdom
const VChart = defineComponent({
  name: 'VChart',
  props: ['option', 'theme', 'autoresize'],
  setup(props) {
    return () => h('div', { class: 'vchart-stub' }, Object.keys(props.option || {}).join(','))
  },
})

export default VChart
