import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createApp, defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { setupI18n, getI18n, __resetI18nForTest } from '@/i18n';
import { useOverviewStore } from '@/stores/overview';
import { useNodesStore } from '@/stores/nodes';
import { makeNode, makeOverview } from '@/api/__fixtures__/nodes';
import OverviewStats from './OverviewStats.vue';

const FAKE_DICT = {
  en: {
    'index.stat.time': 'Current Time',
    'index.stat.total': 'Total Servers',
    'index.stat.online': 'Online',
    'index.stat.online_ratio': 'Online Now',
    'index.stat.regions': 'Active Regions',
    'index.stat.offline': 'Offline',
    'index.stat.latency': 'Avg Latency',
    'index.stat.avg_load': 'Avg Load',
  },
  'zh-CN': {
    'index.stat.time': '当前时间',
    'index.stat.total': '服务器总数',
    'index.stat.online': '在线',
    'index.stat.online_ratio': '当前在线',
    'index.stat.regions': '点亮地区',
    'index.stat.offline': '离线',
    'index.stat.latency': '平均延迟',
    'index.stat.avg_load': '平均负载',
  },
};

const Stub = defineComponent({ render: () => h('div') });

async function mountWith(
  data: ReturnType<typeof makeOverview> | null,
  nodes: ReturnType<typeof makeNode>[] = [],
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useOverviewStore();
  const nodesStore = useNodesStore();
  store.data = data;
  nodesStore.applyServerState(nodes, '2026-06-01T12:00:00Z');
  const wrapper = mount(OverviewStats, { global: { plugins: [pinia, getI18n()] } });
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe('OverviewStats', () => {
  beforeEach(async () => {
    __resetI18nForTest();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(FAKE_DICT),
      } as unknown as Response),
    );
    const dummy = createApp(Stub);
    await setupI18n(dummy);
  });

  afterEach(() => {
    __resetI18nForTest();
    vi.unstubAllGlobals();
  });

  it('shows placeholders when the store has no data', async () => {
    const wrapper = await mountWith(null);
    expect(wrapper.find('[data-test="stat-total"]').text()).toBe('--');
    expect(wrapper.find('[data-test="stat-online"]').text()).toBe('--');
    expect(wrapper.find('[data-test="stat-avg-load"]').text()).toBe('--');
  });

  it('renders the overview numbers', async () => {
    const wrapper = await mountWith(
      makeOverview({
        total_nodes: 12,
        online_nodes: 10,
        offline_nodes: 2,
        average_latency_ms: 8.6,
      }),
    );
    expect(wrapper.find('[data-test="stat-total"]').text()).toBe('12');
    expect(wrapper.find('[data-test="stat-online"]').text()).toBe('10 / 12');
    expect(wrapper.find('[data-test="stat-offline"]').text()).toBe('2');
  });

  it('averages current node load when node snapshots are present', async () => {
    const wrapper = await mountWith(makeOverview(), [
      makeNode({
        snapshot: {
          cpu_usage_percent: 10,
          load: { one: 0.2 },
          memory: { total_bytes: 100, used_bytes: 40 },
        },
      }),
      makeNode({
        identity: { node_id: 'node-b', node_label: 'Node B', hostname: 'host-b', tags: [] },
        snapshot: {
          cpu_usage_percent: 20,
          load: { one: 1.0 },
          memory: { total_bytes: 100, used_bytes: 50 },
        },
      }),
    ]);
    expect(wrapper.find('[data-test="stat-avg-load"]').text()).toBe('0.60');
  });
});
