<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import AppLayout from '@/components/AppLayout.vue';
import ServerUpdateCard from '@/components/ServerUpdateCard.vue';
import OpsCard from '@/components/OpsCard.vue';
import TokenTable from '@/components/TokenTable.vue';
import SettingsMessage from '@/components/SettingsMessage.vue';
import { useSettingsStore } from '@/stores/settings';

const { t } = useI18n();
const store = useSettingsStore();

onMounted(() => {
  void store.load();
});
</script>

<template>
  <AppLayout>
    <template #title>
      <h1 class="page-heading">{{ t('settings.heading') }}</h1>
      <p class="page-subtitle">{{ t('settings.subtitle') }}</p>
    </template>

    <section class="settings" data-test="settings-view">
      <template v-if="store.data">
        <div class="settings__grid">
          <ServerUpdateCard class="settings__card" :settings="store.data" />
          <OpsCard class="settings__card" :settings="store.data" />
        </div>
        <TokenTable class="settings__tokens" :agents="store.data.agents" />
      </template>
      <SettingsMessage
        v-else-if="store.error"
        state="error"
        :text="store.error.message"
        data-test="settings-error"
      />
      <p v-else class="placeholder" data-test="settings-loading">
        {{ t('common.waiting_for_data') }}
      </p>
    </section>
  </AppLayout>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 1180px;
}
.settings__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}
.settings__card,
.settings__tokens {
  min-width: 0;
}
.settings__card {
  height: 100%;
}
.page-heading {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.page-subtitle {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}
.placeholder {
  color: var(--text-muted);
  font-size: 13px;
}
@media (max-width: 880px) {
  .settings {
    max-width: none;
  }
  .settings__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
