//! 告警运行时:把配置规则转换为可复用的触发与巡检摘要视图。

mod evaluator;
mod runtime;
mod tracker;

pub(crate) use evaluator::{
    AlertMetricReading, EvaluatedRule, build_inspection_report, evaluate_rules,
};
pub(crate) use runtime::spawn_alert_runtime;
pub(crate) use tracker::{AlertEvent, AlertEventKind, AlertStateTracker};
