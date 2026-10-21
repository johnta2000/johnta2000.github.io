(() => {
  'use strict';

  const productionHosts = ['john-ta.com', 'www.john-ta.com'];
  if (!productionHosts.includes(window.location.hostname) || window.__siteAnalytics) return;
  window.__siteAnalytics = true;
  const app = document.currentScript?.dataset.app || 'unknown';
  const isTest = app === 'jsx' && /[?&]analytics_test=1(?:&|$)/.test(window.location.search || '');
  const projectToken = 'phc_n65AtSeHwYdMhbeV3YwV9m5uicRpBBH2DDj2tbz9qCVA';

  // Only anonymous page/session metadata leaves the browser. In particular,
  // Tranquil login codes, Rally IDs, form values and error messages must not.
  const allowedProperties = new Set([
    'token', 'distinct_id', '$device_id', '$session_id', '$window_id',
    '$pageview_id', '$lib', '$lib_version', '$browser', '$browser_version',
    '$os', '$os_version', '$device_type', '$host', '$pathname',
    '$current_url', '$referrer', '$referring_domain', '$title',
    '$initial_current_url', '$initial_referrer', '$initial_referring_domain',
    '$session_entry_url', '$session_entry_referrer', '$session_entry_referring_domain',
    '$prev_pageview_pathname', '$prev_pageview_last_scroll',
    '$prev_pageview_max_scroll', '$prev_pageview_last_scroll_percentage',
    '$prev_pageview_max_scroll_percentage', '$prev_pageview_last_content',
    '$prev_pageview_max_content', '$prev_pageview_last_content_percentage',
    '$prev_pageview_max_content_percentage', '$prev_pageview_duration',
    '$viewport_height', '$viewport_width', '$screen_height', '$screen_width',
    '$time', '$timezone', '$timezone_offset', '$is_identified',
    '$process_person_profile', '$cookieless_mode', '$raw_user_agent', '$user_agent',
    'app', 'action', 'element', 'link',
  ]);
  const jsxEvents = new Set(['jsx_booking_clicked', 'jsx_booking_opened', 'jsx_referral_clicked', 'jsx_referral_seen', 'jsx_referral_dismissed', 'jsx_referral_restored', 'jsx_account_prompt_shown', 'jsx_account_prompt_closed', 'jsx_filter_changed', 'jsx_map_route_selected', 'jsx_map_airport_selected']);
  const jsxControls = new Set(['book', 'referral', 'account_continue', 'account_close', 'hide_guide', 'hide_credit', 'show_credit', 'show_guide', 'reset', 'empty_reset', 'clear_price', 'clear_dates', 'sort_price', 'sort_dates', 'first', 'prev', 'next', 'last', 'map_clear', 'map_zoom_in', 'map_zoom_out', 'map_fit', 'map_jump', 'map_view_fares', 'map_check_route']);
  const placements = new Set(['fare_table', 'route_map', 'offer_header', 'guide', 'account_dialog', 'fare_offer', 'selected_route']);
  const filterNames = new Set(['search', 'trip', 'origin', 'destination', 'min-price', 'budget', 'after', 'before', 'weekend', 'sort', 'per-page', 'reset', 'clear-price', 'clear-dates']);
  const toolPaths = new Set(["/tools/jsx/", "/tools/menus/hem-by-lequy/", "/tools/menus/", "/tools/menus/sf-organica/", "/tools/monitoring/", "/tools/rally/", "/tools/seometadata/", "/tools/sleep/", "/tools/standups/", "/tools/tranquil-connect/", "/tools/video-downloader/"]);
  const urlKeys = new Set(['$current_url', '$initial_current_url', '$session_entry_url']);
  const referrerKeys = new Set(['$referrer', '$initial_referrer', '$session_entry_referrer']);
  const safeUrl = (value, originOnly = false) => {
    try {
      const url = new URL(value, window.location.origin);
      return /^https?:$/.test(url.protocol) ? url.origin + (originOnly ? '/' : url.pathname) : '';
    } catch { return ''; }
  };
  const standardErrorTypes = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'AggregateError']);
  let exceptionsSent = 0;
  function sanitizeEvent(event) {
    if (!event || (!['$pageview', '$pageleave', '$exception', 'ui_interaction', 'homepage_link_clicked'].includes(event.event) && !(app === 'jsx' && jsxEvents.has(event.event)))) return null;
    const source = event.properties || {};
    const clean = {};
    for (const [key, value] of Object.entries(source)) {
      if (!allowedProperties.has(key)) continue;
      if (urlKeys.has(key)) clean[key] = safeUrl(value);
      else if (referrerKeys.has(key)) clean[key] = value ? safeUrl(value, true) : '';
      else if (key === '$title') clean[key] = app;
      else if (['string', 'number', 'boolean'].includes(typeof value)) clean[key] = value;
    }
    // Extra dimensions are constrained public control identifiers, never form contents or URLs.
    if (app === 'jsx') {
      if (source.referral_variant === 'credit_near_fares_v1') clean.referral_variant = source.referral_variant;
      if (jsxControls.has(source.control)) clean.control = source.control;
      if (placements.has(source.placement)) clean.placement = source.placement;
      if (filterNames.has(source.filter_name)) clean.filter_name = source.filter_name;
      if (['one_way', 'round_trip', 'all'].includes(source.trip_type)) clean.trip_type = source.trip_type;
      if (Number.isInteger(source.result_count) && source.result_count >= 0 && source.result_count <= 100000) clean.result_count = source.result_count;
    }
    if (event.event === 'ui_interaction' && toolPaths.has(source.target_tool)) clean.target_tool = source.target_tool;
    clean.tracking_version = '20261019-1';
    if (isTest) clean.is_test = true;
    clean.app = app;
    if (event.event === '$exception') {
      if (++exceptionsSent > 10) return null; // Keep a broken client from flooding the free plan.
      clean.$exception_list = (source.$exception_list || []).slice(0, 3).map((error) => {
        const type = standardErrorTypes.has(error.type) ? error.type : 'Error';
        return {
          type,
          value: `${type} (message omitted for privacy)`,
          mechanism: { type: 'generic', handled: false },
          stacktrace: { type: 'raw', frames: (error.stacktrace?.frames || []).slice(-30).map((frame) => ({
            platform: 'javascript',
            filename: safeUrl(frame.filename || ''),
            function: /^[a-zA-Z0-9_.$<> ]{1,100}$/.test(frame.function || '') ? frame.function : undefined,
            lineno: Number.isFinite(frame.lineno) ? frame.lineno : undefined,
            colno: Number.isFinite(frame.colno) ? frame.colno : undefined,
          })) },
        };
      });
    }
    event.properties = clean;
    return event;
  }

  // Capture early clicks while the asynchronous SDK is loading; a blocked SDK keeps only a bounded in-memory queue.
  let ready = false;
  const pending = [];
  function capture(name, properties = {}) {
    const clean = sanitizeEvent({ event: name, properties: { ...properties } });
    if (!clean) return;
    if (!ready) { if (pending.length < 50) pending.push(clean); return; }
    try { window.posthog.capture(clean.event, clean.properties, { transport: 'sendBeacon' }); } catch { /* Analytics must never interrupt navigation. */ }
  }
  window.SiteAnalytics = { capture };
  function trackClick(event) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const element = event.target?.closest?.('a, button, input[type="submit"]');
    if (!element) return;
    const link = element.dataset.analyticsLink;
    if (app === 'home' && ['affil', 'linkedin', 'login'].includes(link)) capture('homepage_link_clicked', { link });
    else {
      const properties = { action: 'click', element: element.tagName.toLowerCase() };
      if (app === 'jsx') {
        properties.control = element.dataset.analyticsControl;
        properties.placement = element.dataset.analyticsPlacement;
      }
      if (element.href) {
        try { const target = new URL(element.href, window.location.origin); if (target.origin === window.location.origin && toolPaths.has(target.pathname)) properties.target_tool = target.pathname; } catch { /* Ignore invalid links. */ }
      }
      capture('ui_interaction', properties);
    }
  }
  document.addEventListener('click', trackClick);
  document.addEventListener('auxclick', trackClick);
  const script = document.createElement('script');
  script.src = 'https://us-assets.i.posthog.com/static/array.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.onload = () => {
    if (!window.posthog) return;
    window.posthog.init(projectToken, {
      api_host: 'https://us.i.posthog.com',
      defaults: '2026-05-30',
      cookieless_mode: 'always',
      person_profiles: 'never',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_capture_url_hashes: true,
      respect_dnt: true,
      before_send: sanitizeEvent,
    });

    ready = true;
    pending.splice(0).forEach(event => capture(event.event, event.properties));
  };
  document.head.appendChild(script);
})();
