use ai_agent_workspace_commands::CommandError;
use rmcp::model::ErrorCode;

pub fn to_mcp_error(err: CommandError) -> rmcp::Error {
    let code = match err.error.as_str() {
        "not_found" => ErrorCode(-32001),
        "already_exists" => ErrorCode(-32002),
        "invalid_input" => ErrorCode(-32602),
        _ => ErrorCode(-32000),
    };
    rmcp::Error::new(
        code,
        err.message,
        Some(serde_json::json!({
            "entity": err.entity,
            "id": err.id,
        })),
    )
}
