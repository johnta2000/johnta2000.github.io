"""Offline regressions for page identity, duplicate routes, and actionable failures."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('site_health', Path(__file__).with_name('site-health.py'))
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


class HealthTests(unittest.TestCase):
    page = {'path': '/diary/', 'analytics': False, 'title': 'Rave diary · Raveington'}

    def test_source_and_build_are_checked_once(self):
        pages = [{**self.page, 'file': file} for file in ['src/index.html', 'dist/index.html']]
        self.assertEqual(len(health.unique_pages(pages)), 1)

    def test_conflicting_duplicate_routes_fail(self):
        with self.assertRaisesRegex(ValueError, 'Conflicting page identities for /diary/'):
            health.unique_pages([self.page, {**self.page, 'title': 'Old name'}])

    def test_renamed_title_passes_without_analytics(self):
        parser = health.inspect_page(self.page, 'text/html', '<title>Rave diary · Raveington</title>')
        self.assertEqual(parser.apps, set())

    def test_stale_title_explains_expected_actual_and_fix(self):
        with self.assertRaises(ValueError) as error:
            health.inspect_page(self.page, 'text/html', '<title>Old name</title>')
        for text in [self.page['title'], 'Old name', 'site-pages.json']:
            self.assertIn(text, str(error.exception))

    def test_html_entities_and_attribute_quotes_are_parsed(self):
        health.inspect_page({**self.page, 'title': 'Diary & trips'}, 'text/html', '<title>Diary &amp; trips</title>')
        health.inspect_page({'app': 'home'}, 'text/html', "<script data-app='home'></script>")

    def test_wrong_page_and_non_html_still_fail(self):
        with self.assertRaisesRegex(ValueError, 'Expected data-app'):
            health.inspect_page({'app': 'home'}, 'text/html', '<title>Not found</title>')
        with self.assertRaisesRegex(ValueError, 'Expected HTML'):
            health.inspect_page(self.page, 'application/json', '{}')

    def run_check(self, response):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'scripts/monitoring').mkdir(parents=True)
            (root / 'scripts/monitoring/site-pages.json').write_text(json.dumps([self.page, self.page]))
            summary_path = root / 'summary.md'
            output = io.StringIO()
            with patch.object(health, 'ROOT', root), patch.object(health, 'fetch', side_effect=response) as fetch:
                with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_STEP_SUMMARY': str(summary_path)}):
                    with contextlib.redirect_stdout(output):
                        failed = health.main()
            return failed, output.getvalue(), summary_path.read_text(), fetch.call_count

    def test_live_failure_remains_red_and_identifies_the_url(self):
        failed, output, summary, calls = self.run_check(lambda url: ('text/html', '<title>Wrong page</title>'))
        self.assertTrue(failed)
        self.assertEqual(calls, 1)
        self.assertIn('::error title=Site health check failed::', output)
        self.assertIn('https://www.john-ta.com/diary/', summary)
        self.assertIn('Wrong page', summary)
        self.assertIn('FAILED', summary)

    def test_success_includes_assets_and_duplicates_do_not_inflate_count(self):
        def response(url):
            if url.endswith('.js'):
                return 'text/javascript', 'console.log("loaded")'
            return 'text/html', '<title>Rave diary · Raveington</title><script src="app.js"></script>'
        failed, output, summary, calls = self.run_check(response)
        self.assertFalse(failed)
        self.assertEqual(calls, 2)
        self.assertIn('1/1 unique app pages passed; 1 local scripts/styles checked.', output)
        self.assertIn('PASSED', summary)

    def test_broken_asset_still_fails(self):
        def response(url):
            if url.endswith('.js'):
                raise OSError('HTTP Error 404: Not Found')
            return 'text/html', '<title>Rave diary · Raveington</title><script src="app.js"></script>'
        failed, output, summary, calls = self.run_check(response)
        self.assertTrue(failed)
        self.assertIn('https://www.john-ta.com/diary/app.js', summary)
        self.assertIn('404', output)

    def test_annotations_cannot_inject_workflow_commands(self):
        self.assertEqual(health.annotation('100%\r\n::notice::'), '100%25%0D%0A::notice::')


if __name__ == '__main__':
    unittest.main()
