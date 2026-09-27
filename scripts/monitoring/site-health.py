#!/usr/bin/env python3
"""Read-only availability checks for every published personal-site entry point."""
import concurrent.futures
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://www.john-ta.com'

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'):
            self.urls.append(attrs['src'])
        elif tag == 'link' and 'stylesheet' in attrs.get('rel', '').split() and attrs.get('href'):
            self.urls.append(attrs['href'])

def fetch(url):
    for attempt in range(2):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'JohnTaSiteHealth/1.0', 'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(request, timeout=20) as response:
                if urllib.parse.urlparse(response.url).netloc != urllib.parse.urlparse(BASE).netloc:
                    raise ValueError('Unexpected cross-domain redirect')
                return response.headers.get('Content-Type', ''), response.read().decode('utf8', errors='replace')
        except (OSError, ValueError):
            if attempt: raise
            time.sleep(2)

def main():
    pages = json.loads((ROOT / 'scripts/monitoring/site-pages.json').read_text())
    errors, assets, passed = [], set(), 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {pool.submit(fetch, BASE + page['path']): page for page in pages}
        for job in concurrent.futures.as_completed(jobs):
            page = jobs[job]
            try:
                content_type, html = job.result()
                if 'text/html' not in content_type or f'data-app="{page["app"]}"' not in html:
                    raise ValueError('Expected app page/analytics marker missing')
                parser = Assets()
                parser.feed(html)
                for src in parser.urls:
                    url = urllib.parse.urljoin(BASE + page['path'], src)
                    if urllib.parse.urlparse(url).netloc == urllib.parse.urlparse(BASE).netloc:
                        assets.add(url)
                passed += 1
            except Exception as error:
                errors.append(f'{page["path"]}: {error}')
        jobs = {pool.submit(fetch, url): url for url in assets}
        for job in concurrent.futures.as_completed(jobs):
            try:
                content_type, body = job.result()
                if 'text/html' in content_type or not body.strip():
                    raise ValueError('Expected nonempty script or stylesheet')
            except Exception as error:
                errors.append(f'{jobs[job]}: {error}')
    summary = f'{passed}/{len(pages)} app pages checked; {len(assets)} local scripts/styles checked.\n'
    summary += '\n'.join(errors) if errors else 'All checks passed.'
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write('## Personal site health\n\n' + summary + '\n')
    return bool(errors)

if __name__ == '__main__':
    raise SystemExit(main())
