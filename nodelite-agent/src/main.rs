//! NodeLite Agent 入口程序。

mod collector;
mod config_io;
mod runtime;
mod session;
mod support;

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    runtime::run().await
}
