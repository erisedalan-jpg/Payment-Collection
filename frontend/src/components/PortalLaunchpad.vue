<script setup lang="ts">
import type { PortalSection, PortalItem } from '@/lib/portal'
import { initials, avatarColor, isSafeUrl } from '@/lib/portal'
import { downloadUrl } from '@/lib/portalApi'

defineProps<{ sections: PortalSection[] }>()

function linkAttrs(item: PortalItem): Record<string, string> {
  if (item.type === 'file') return { href: downloadUrl(item.id) }
  return { href: isSafeUrl(item.url) ? item.url : '#', target: '_blank', rel: 'noopener noreferrer' }
}
</script>

<template>
  <div class="pl-wrap" data-test="portal-launchpad">
    <section v-for="sec in sections" :key="sec.key" class="pl-sec">
      <div class="pl-sec-label">
        <span v-if="sec.featured" class="pl-star" aria-hidden="true">★</span>{{ sec.label }}
      </div>
      <div class="pl-grid">
        <a v-for="item in sec.items" :key="item.id" class="pl-tile" v-bind="linkAttrs(item)"
           :title="item.name" :data-test="'portal-item-' + item.id">
          <span class="pl-icon" :style="item.emoji ? {} : { background: avatarColor(item.name) }">
            <span v-if="item.emoji" class="pl-emoji">{{ item.emoji }}</span>
            <span v-else class="pl-initial">{{ initials(item.name) }}</span>
          </span>
          <span class="pl-name">{{ item.name }}</span>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pl-wrap { display: flex; flex-direction: column; gap: var(--gap-stack); }
.pl-sec { display: flex; flex-direction: column; gap: var(--sp-2); }
.pl-sec-label {
  font-size: var(--fs-1); font-weight: 700; color: var(--mut);
  letter-spacing: var(--ls-wide); display: flex; align-items: center; gap: var(--sp-1);
}
.pl-star { color: var(--warn-text); font-size: var(--fs-2); }
.pl-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: var(--sp-3) var(--sp-2);
}
.pl-tile {
  display: flex; flex-direction: column; align-items: center; gap: var(--sp-1);
  text-decoration: none; color: inherit; padding: var(--sp-1);
  border-radius: var(--r-md); transition: background var(--dur-1) var(--ease);
}
.pl-tile:hover { background: var(--hover-tint); }
.pl-icon {
  width: 48px; height: 48px; border-radius: var(--r-md);
  display: grid; place-items: center; box-shadow: var(--shadow-1);
  color: var(--on-accent); overflow: hidden;
}
.pl-emoji { font-size: 24px; line-height: 1; }
.pl-initial { font-size: var(--fs-4); font-weight: 700; color: var(--on-accent); }
.pl-name {
  font-size: var(--fs-1); color: var(--txt); text-align: center;
  max-width: 76px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
