//! 告警运行时:把配置规则转换为可复用的触发与巡检摘要视图。

mod evaluator;

pub(crate) use evaluator::{build_inspection_report, evaluate_rules};
