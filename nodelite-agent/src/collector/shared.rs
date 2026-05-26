//! Linux/macOS 采集器共享的纯计算逻辑。
//!
//! 这些 helper 只依赖采样值本身,不关心平台如何读取 `/proc`、sysctl 或 Mach API,
//! 因此集中在一个模块里避免跨平台实现再次复制并产生漂移。

use std::time::Instant;

use nodelite_proto::percentage;

#[derive(Debug, Clone, Copy)]
pub(super) struct CpuSample {
    pub(super) total: u64,
    pub(super) idle: u64,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct NetworkSample {
    pub(super) observed_at: Instant,
    pub(super) rx_bytes: u64,
    pub(super) tx_bytes: u64,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct NetworkTotals {
    pub(super) rx_bytes: u64,
    pub(super) tx_bytes: u64,
}

pub(super) fn compute_cpu_usage(previous: CpuSample, current: CpuSample) -> f64 {
    let total_delta = current.total.saturating_sub(previous.total);
    let idle_delta = current.idle.saturating_sub(previous.idle);
    if total_delta == 0 {
        return 0.0;
    }
    let busy = total_delta.saturating_sub(idle_delta);
    percentage(busy, total_delta)
}

pub(super) fn compute_network_rates(
    previous: NetworkSample,
    observed_at: Instant,
    current: NetworkTotals,
) -> (Option<f64>, Option<f64>) {
    let elapsed = observed_at
        .duration_since(previous.observed_at)
        .as_secs_f64();
    if elapsed <= f64::EPSILON {
        return (None, None);
    }

    let rx_rate = (current.rx_bytes >= previous.rx_bytes)
        .then(|| (current.rx_bytes - previous.rx_bytes) as f64 / elapsed);
    let tx_rate = (current.tx_bytes >= previous.tx_bytes)
        .then(|| (current.tx_bytes - previous.tx_bytes) as f64 / elapsed);
    (rx_rate, tx_rate)
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::{
        CpuSample, NetworkSample, NetworkTotals, compute_cpu_usage, compute_network_rates,
    };

    #[test]
    fn computes_cpu_usage_from_deltas() {
        let previous = CpuSample {
            total: 560,
            idle: 410,
        };
        let current = CpuSample {
            total: 680,
            idle: 440,
        };

        let usage = compute_cpu_usage(previous, current);
        assert!(usage > 70.0 && usage < 80.0);
    }

    #[test]
    fn computes_network_rates_from_deltas() {
        let previous = NetworkSample {
            observed_at: Instant::now() - Duration::from_secs(2),
            rx_bytes: 100,
            tx_bytes: 40,
        };
        let current = NetworkTotals {
            rx_bytes: 220,
            tx_bytes: 100,
        };

        let (rx_rate, tx_rate) = compute_network_rates(previous, Instant::now(), current);
        assert!(rx_rate.expect("rx rate should be reported") > 50.0);
        assert!(tx_rate.expect("tx rate should be reported") > 20.0);
    }
}
