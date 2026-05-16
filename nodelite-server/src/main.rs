use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    nodelite_server::cli_main().await
}
