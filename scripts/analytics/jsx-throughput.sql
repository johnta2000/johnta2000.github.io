-- Count actions and anonymous daily visitors separately. Ignore the developer verification visits.
-- Version-filtered pageviews make the denominator comparable with the new goals from rollout onward.
SELECT
    toDate(toTimeZone(timestamp, 'America/Los_Angeles')) AS day,
    uniqExactIf(distinct_id, event = '$pageview') AS visitors,
    countIf(event = '$pageview') AS pageviews,
    uniqExactIf(distinct_id, event = 'ui_interaction') AS clicking_visitors,
    countIf(event = 'ui_interaction') AS total_clicks,
    uniqExactIf(distinct_id, event = 'jsx_filter_changed') AS filtering_visitors,
    uniqExactIf(distinct_id, event = 'jsx_booking_clicked') AS booking_intent_visitors,
    countIf(event = 'jsx_booking_opened') AS jsx_clickthroughs,
    uniqExactIf(distinct_id, event = 'jsx_booking_opened') AS jsx_clickthrough_visitors,
    countIf(event = 'jsx_referral_clicked') AS referral_clicks,
    uniqExactIf(distinct_id, event = 'jsx_referral_clicked') AS referral_visitors
FROM events
WHERE properties.app = 'jsx'
    AND properties.tracking_version = '20261019-1'
    AND coalesce(properties.is_test, false) = false
    AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day DESC
LIMIT 30
