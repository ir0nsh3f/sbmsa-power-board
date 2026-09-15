"""Fall 2026 scope extension; historical ranking configurations stay immutable."""
import unittest
from scripts import update_results as collector, ratings

class GirlsScope(unittest.TestCase):
    def test_official_scope(self):
        self.assertEqual([(s,d,i) for s,d,i in collector.SOURCES if s=='5ug'], [('5ug','Akers',710194),('5ug','Boxx',710195)])
        self.assertEqual(collector.EXPECTED_TEAM_COUNTS[710194],12)
        self.assertEqual(collector.EXPECTED_TEAM_COUNTS[710195],12)
        self.assertEqual(ratings.compute([], '5ug', 'capped'), [])
