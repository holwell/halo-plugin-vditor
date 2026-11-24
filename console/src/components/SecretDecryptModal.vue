<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "confirm", password: string): void;
}>();

const password = ref("");

watch(
  () => props.open,
  (open) => {
    if (open) password.value = "";
  },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="hs-decrypt-mask" @click.self="emit('close')">
      <div class="hs-decrypt-modal" role="dialog" aria-modal="true" aria-label="解密选中内容">
        <div class="hs-decrypt-head">
          <strong>解密选中内容</strong>
          <button type="button" class="hs-decrypt-close" aria-label="关闭" @click="emit('close')">×</button>
        </div>
        <input
          v-model="password"
          class="hs-decrypt-input"
          type="password"
          placeholder="请输入加密时使用的密钥"
          @keyup.enter="emit('confirm', password)"
        />
        <div class="hs-decrypt-actions">
          <button type="button" class="hs-decrypt-cancel" @click="emit('close')">取消</button>
          <button type="button" class="hs-decrypt-confirm" @click="emit('confirm', password)">解密并还原</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.hs-decrypt-mask {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.hs-decrypt-modal {
  box-sizing: border-box;
  width: min(420px, calc(100vw - 32px));
  padding: 16px;
  border-radius: 10px;
  background: var(--halo-surface, #fff);
  color: inherit;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.hs-decrypt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.hs-decrypt-close {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  color: inherit;
}

.hs-decrypt-input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--halo-divider, #d1d5db);
  border-radius: 6px;
  background: var(--halo-input-bg, #fff);
  color: inherit;
}

.hs-decrypt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.hs-decrypt-actions button {
  padding: 6px 14px;
  border: 1px solid var(--halo-divider, #d1d5db);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.hs-decrypt-actions .hs-decrypt-confirm {
  border-color: var(--halo-primary, #3478cd);
  background: var(--halo-primary, #3478cd);
  color: #fff;
}
</style>
