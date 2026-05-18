use url::{Url, form_urlencoded};

use super::{ConfigError, MAX_NODE_TAG_BYTES, MAX_NODE_TAGS};
use crate::netutil::uses_insecure_remote_url;
use crate::validation::{normalize_string_list, validate_non_empty, validate_tag_list};

/// 校验 URL 字段:能被解析,并且采用了允许的协议方案。
pub(super) fn validate_url(field: &str, value: &str, schemes: &[&str]) -> Result<(), ConfigError> {
    let parsed =
        Url::parse(value).map_err(|error| ConfigError::new(format!("invalid {field}: {error}")))?;
    if !schemes.iter().any(|scheme| *scheme == parsed.scheme()) {
        return Err(ConfigError::new(format!(
            "{field} must use one of these schemes: {}",
            schemes.join(", ")
        )));
    }
    Ok(())
}

pub(super) fn normalize_tags(field: &str, values: Vec<String>) -> Result<Vec<String>, ConfigError> {
    let values = normalize_string_list(values);
    validate_tag_list(field, &values, MAX_NODE_TAGS, MAX_NODE_TAG_BYTES)?;
    Ok(values)
}

/// 校验 SHA-256 摘要:长度必须是 64 个十六进制字符。
pub(super) fn validate_sha256(field: &str, value: &str) -> Result<(), ConfigError> {
    validate_non_empty(field, value)?;
    if value.len() != 64 || !value.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(ConfigError::new(format!(
            "{field} must be a 64-character hexadecimal SHA-256 digest"
        )));
    }
    Ok(())
}

/// 兼容常见的 TOTP secret 输入形式:
/// - 纯 RFC4648 Base32
/// - 带空格/连字符/小写的手工录入
/// - 直接粘贴 `otpauth://...?...secret=...`
/// - 只粘贴 `secret=...` 这样的查询片段
pub fn normalize_totp_secret(value: &str) -> String {
    let candidate =
        extract_totp_secret_candidate(value).unwrap_or_else(|| value.trim().to_string());
    candidate
        .chars()
        .filter(|ch| !ch.is_ascii_whitespace() && *ch != '-')
        .collect::<String>()
        .to_ascii_uppercase()
}

fn extract_totp_secret_candidate(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if let Ok(url) = Url::parse(trimmed)
        && url.scheme().eq_ignore_ascii_case("otpauth")
    {
        return extract_secret_query_value(url.query().unwrap_or_default());
    }

    if trimmed.contains("secret=") {
        return extract_secret_query_value(trimmed.trim_start_matches('?'));
    }

    None
}

fn extract_secret_query_value(query: &str) -> Option<String> {
    form_urlencoded::parse(query.as_bytes()).find_map(|(key, value)| {
        key.eq_ignore_ascii_case("secret")
            .then(|| value.into_owned())
            .filter(|value| !value.trim().is_empty())
    })
}

fn decode_totp_secret_bytes(value: &str) -> Option<Vec<u8>> {
    let normalized = normalize_totp_secret(value);
    base32::decode(base32::Alphabet::Rfc4648 { padding: false }, &normalized)
        .or_else(|| base32::decode(base32::Alphabet::Rfc4648 { padding: true }, &normalized))
}

pub(super) fn validate_totp_secret(field: &str, value: &str) -> Result<(), ConfigError> {
    validate_non_empty(field, value)?;
    let decoded = decode_totp_secret_bytes(value);
    let Some(decoded) = decoded else {
        return Err(ConfigError::new(format!(
            "{field} must be a valid RFC4648 base32 TOTP secret"
        )));
    };
    if decoded.len() < 10 {
        return Err(ConfigError::new(format!(
            "{field} must decode to at least 10 bytes"
        )));
    }
    Ok(())
}

pub(super) fn uses_insecure_remote_public_base_url(public_base_url: &str) -> bool {
    uses_insecure_remote_url(public_base_url, "http")
}
