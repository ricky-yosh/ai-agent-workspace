pub fn now_epoch_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn epoch_millis_to_iso(millis: i64) -> String {
    let dt = chrono::DateTime::from_timestamp_millis(millis)
        .unwrap_or_default();
    dt.to_rfc3339()
}
