'use strict'
/* 预期噪音的匹配器。**只此一份实现** —— capture.js 与契约测试都 require 它。
 *
 * 单独抽出来的理由:如果测试里再写一份等价逻辑,两份就会漂移,而漂移的方向必然是
 * 「测试以为拦住了、真跑时没拦住」或反过来。本仓吃过这个亏(跨语言复制口径)。
 *
 * 规则:message 同时包含 match 与 and(and 可省)才算预期噪音、才被放行。
 * 用两个子串而不是完整 URL —— 完整 URL 会把端口焊死,换端口即失效(实测过);
 * 也不用笼统的「status of 401」—— 那会连带吞掉真正的 401,白名单一宽工具就瞎了。
 */
function matchesIgnore(message, ignoreList) {
  const s = String(message)
  return (ignoreList || []).some(
    (ig) => s.includes(ig.match) && (!ig.and || s.includes(ig.and)),
  )
}

module.exports = { matchesIgnore }
