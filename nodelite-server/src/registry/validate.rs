use std::collections::HashMap;
use std::path::Path;

use anyhow::{Result, bail};
use nodelite_proto::{
    MAX_NODE_TAG_BYTES, MAX_NODE_TAGS, NodeIdentity, validate_identifier, validate_non_empty,
    validate_tag_list,
};

use super::{InstallSession, RegisteredNode, RegistryFile};

pub(super) fn validate_registry_file(path: &Path, file: &RegistryFile) -> Result<()> {
    let mut seen_nodes = HashMap::with_capacity(file.nodes.len());
    for node in &file.nodes {
        validate_registered_node(node)?;
        if seen_nodes.insert(node.node_id.as_str(), ()).is_some() {
            bail!("duplicate node_id {} in {}", node.node_id, path.display());
        }
    }
    let mut seen_install_tokens = HashMap::with_capacity(file.install_sessions.len());
    for session in &file.install_sessions {
        validate_install_session(session)?;
        if !seen_nodes.contains_key(session.node_id.as_str()) {
            bail!(
                "install token for unknown node_id {} in {}",
                session.node_id,
                path.display()
            );
        }
        if seen_install_tokens
            .insert(session.token.as_str(), ())
            .is_some()
        {
            bail!("duplicate install token in {}", path.display());
        }
    }
    Ok(())
}

pub(super) fn validate_registered_node(node: &RegisteredNode) -> Result<()> {
    validate_identifier("node.node_id", &node.node_id)?;
    validate_non_empty("node.node_label", &node.node_label)?;
    // 注册表中 token 必须以哈希形式存在; 旧版本的明文 `token` 字段
    // 在 `migrate_legacy_tokens` 中已经被搬迁过来。
    if node.token_hash.is_empty() && node.token.is_empty() {
        bail!("node.token_hash is empty");
    }
    validate_tag_list("node.tags", &node.tags, MAX_NODE_TAGS, MAX_NODE_TAG_BYTES)?;
    Ok(())
}

fn validate_install_session(session: &InstallSession) -> Result<()> {
    validate_non_empty("install_session.token", &session.token)?;
    validate_identifier("install_session.node_id", &session.node_id)?;
    Ok(())
}

pub(super) fn validate_runtime_identity(identity: &NodeIdentity) -> Result<()> {
    validate_identifier("identity.node_id", &identity.node_id)?;
    validate_non_empty("identity.node_label", &identity.node_label)?;
    validate_non_empty("identity.agent_version", &identity.agent_version)?;
    validate_non_empty("identity.hostname", &identity.hostname)?;
    validate_non_empty("identity.os", &identity.os)?;
    validate_tag_list(
        "identity.tags",
        &identity.tags,
        MAX_NODE_TAGS,
        MAX_NODE_TAG_BYTES,
    )?;
    Ok(())
}
