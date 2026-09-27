(() => {
  'use strict';

  const productionHosts = ['john-ta.com', 'www.john-ta.com'];
  if (!productionHosts.includes(window.location.hostname) || window.__siteAnalytics) return;
  window.__siteAnalytics = true;
  const app = document.currentScript?.dataset.app || 'unknown';
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
    '$process_person_profile', '$cookieless_mode',
    'app', 'action', 'element', 'link',
  ]);
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
    if (!event || !['$pageview', '$pageleave', '$exception', 'ui_interaction', 'homepage_link_clicked'].includes(event.event)) return null;
    const source = event.properties || {};
    const clean = {};
    for (const [key, value] of Object.entries(source)) {
      if (!allowedProperties.has(key)) continue;
      if (urlKeys.has(key)) clean[key] = safeUrl(value);
      else if (referrerKeys.has(key)) clean[key] = value ? safeUrl(value, true) : '';
      else if (key === '$title') clean[key] = app;
      else if (['string', 'number', 'boolean'].includes(typeof value)) clean[key] = value;
    }
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

    document.addEventListener('click', (event) => {
      const element = event.target?.closest?.('a, button, input[type="submit"]');
      if (!element) return;
      const link = element.dataset.analyticsLink;
      if (app === 'home' && ['affil', 'linkedin', 'login'].includes(link)) {
        window.posthog.capture('homepage_link_clicked', { link }, { transport: 'sendBeacon' });
      } else {
        window.posthog.capture('ui_interaction', { action: 'click', element: element.tagName.toLowerCase() }, { transport: 'sendBeacon' });
      }
    });
  };
  document.head.appendChild(script);
})();
