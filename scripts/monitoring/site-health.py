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
        self.title = ''
        self.in_title = False
        self.apps = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'title':
            self.in_title = True
        if attrs.get('data-app'):
            self.apps.add(attrs['data-app'])
        if tag == 'script' and attrs.get('src'):
            self.urls.append(attrs['src'])
        elif tag == 'link' and 'stylesheet' in attrs.get('rel', '').split() and attrs.get('href'):
            self.urls.append(attrs['href'])
    def handle_data(self, data):
        if self.in_title:
            self.title += data
    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False

def page_identity(page):
    return ('title', page['title']) if page.get('analytics') is False else ('data-app', page['app'])

def unique_pages(pages):
    """Source templates and built HTML can describe the same deployed route."""
    routes = {}
    for page in pages:
        previous = routes.get(page['path'])
        if previous and page_identity(previous) != page_identity(page):
            raise ValueError(f'Conflicting page identities for {page["path"]}')
        routes[page['path']] = page
    return list(routes.values())

def inspect_page(page, content_type, html):
    if 'text/html' not in content_type:
        raise ValueError(f'Expected HTML, received {content_type!r}')
    parser = Assets()
    parser.feed(html)
    kind, expected = page_identity(page)
    if kind == 'title' and parser.title != expected:
        raise ValueError(f'Page title mismatch: expected {expected!r}, received {parser.title!r}. '
                         'If the rename is intentional, update scripts/monitoring/site-pages.json.')
    if kind == 'data-app' and expected not in parser.apps:
        raise ValueError(f'Expected data-app={expected!r}, received {sorted(parser.apps)!r}. '
                         'Check the page analytics tag and scripts/monitoring/site-pages.json.')
    return parser

def annotation(value):
    return str(value).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')

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
    pages = unique_pages(json.loads((ROOT / 'scripts/monitoring/site-pages.json').read_text()))
    errors, assets, passed = [], set(), 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {pool.submit(fetch, BASE + page['path']): page for page in pages}
        for job in concurrent.futures.as_completed(jobs):
            page = jobs[job]
            try:
                content_type, html = job.result()
                parser = inspect_page(page, content_type, html)
                for src in parser.urls:
                    url = urllib.parse.urljoin(BASE + page['path'], src)
                    if urllib.parse.urlparse(url).netloc == urllib.parse.urlparse(BASE).netloc:
                        assets.add(url)
                passed += 1
            except Exception as error:
                errors.append((BASE + page['path'], str(error)))
        jobs = {pool.submit(fetch, url): url for url in assets}
        for job in concurrent.futures.as_completed(jobs):
            try:
                content_type, body = job.result()
                if 'text/html' in content_type or not body.strip():
                    raise ValueError('Expected nonempty script or stylesheet')
            except Exception as error:
                errors.append((jobs[job], str(error)))
    errors.sort()
    summary = f'{passed}/{len(pages)} unique app pages passed; {len(assets)} local scripts/styles checked.\n'
    summary += '\n'.join(f'{url}: {error}' for url, error in errors) if errors else 'All checks passed.'
    print(summary)
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        for url, error in errors:
            print(f'::error title=Site health check failed::{annotation(url + ": " + error)}')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write('## Personal site health — ' + ('FAILED' if errors else 'PASSED') + '\n\n')
            output.write(summary.split('\n', 1)[0] + '\n\n')
            if errors:
                for url, error in errors:
                    output.write(f'- [{url}]({url}): {error}\n')
            else:
                output.write('All checks passed.\n')
            output.write('\nScope: public page shells and first-party scripts/styles. '
                         'This does not test signed-in data or search-engine indexing.\n')
    return bool(errors)

if __name__ == '__main__':
    raise SystemExit(main())
