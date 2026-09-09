"""Official LocationLink destinations are preserved, never geocoded."""
from pathlib import Path
import unittest
from bs4 import BeautifulSoup
from test_schedule import results, page, row, parse


class LocationLinkTests(unittest.TestCase):
    def test_real_official_location_links(self):
        fragment = (Path(__file__).parent / 'fixtures/location-links.html').read_text()
        for link in BeautifulSoup(fragment, 'html.parser').select('a'):
            with self.subTest(field=link.get_text(strip=True)):
                html = page(row()).replace('<a id="r_LocationLink" href="https://example.org/map"><span id="r_ScheduleLabel">MMS Aux East</span></a>', str(link))
                game = parse(html)['schedule'][0]
                self.assertEqual(game.get('location_url'), link['href'])
                self.assertEqual(game['location'], link.get_text(strip=True))

    def test_url_validation_and_relative_resolution(self):
        for href, base, expected in [
            ('//maps.google.com/maps?q=1&x=2', 'https://sbmsa.net/', 'https://maps.google.com/maps?q=1&x=2'),
            ('/maps?q=1', 'https://www.google.com/location', 'https://www.google.com/maps?q=1'),
            ('/locations/1', 'https://sbmsa.net/', None),
            *[(u, 'https://sbmsa.net/', None) for u in [None, '', 'javascript:alert(1)', 'data:text/html,x', 'ftp://maps.google.com/maps', 'https://google.com.evil/maps', 'https://evil/maps', 'https://www.google.com/url?q=https://evil', 'https://user@maps.google.com/maps', 'https://maps.google.com:444/maps', 'https://maps.google.com/\\@evil/maps', 'https://maps.google.com/\nmaps']],
        ]:
            with self.subTest(href=href):
                self.assertEqual(results.safe_location_url(href, base), expected)

    def test_missing_or_unsafe_link_keeps_plain_field(self):
        for href in ['', 'javascript:alert(1)', 'https://example.org/map']:
            game = parse(page(row()).replace('https://example.org/map', href))['schedule'][0]
            self.assertEqual(game['location'], 'MMS Aux East')
            self.assertIsNone(game.get('location_url'))
