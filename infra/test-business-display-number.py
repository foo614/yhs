"""Synthetic contract checks for the production-only env override."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).parent / "ubuntu" / "apply-business-display-number.py"
VARIABLE = "WHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER"


class BusinessDisplayNumberOverrideTests(unittest.TestCase):
    def apply(self, original: bytes, value: str):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_bytes(original)
            environment = os.environ.copy()
            environment[VARIABLE] = value
            result = subprocess.run([sys.executable, str(SCRIPT), str(path)], env=environment,
                                    capture_output=True, text=True, check=False)
            return result, path.read_bytes()

    def test_blank_variable_preserves_entire_secret_file(self):
        original = b"POSTGRES_PASSWORD=synthetic-secret\r\nWHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER=60111111111\r\n"
        result, actual = self.apply(original, "")
        self.assertEqual(0, result.returncode)
        self.assertEqual(original, actual)

    def test_replaces_only_exact_key_and_preserves_other_bytes(self):
        original = (b"POSTGRES_PASSWORD=synthetic-secret\r\n"
                    b"WHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER=60111111111\r\n"
                    b"WHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER_NOTE=unchanged\r\n"
                    b"ACCESS_TOKEN=synthetic-token")
        expected = original.replace(b"WHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER=60111111111",
                                    b"WHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER=60122222222")
        result, actual = self.apply(original, "60122222222")
        self.assertEqual(0, result.returncode)
        self.assertEqual(expected, actual)
        self.assertEqual("", result.stdout + result.stderr)

    def test_appends_missing_key_without_changing_existing_bytes(self):
        original = b"POSTGRES_PASSWORD=synthetic-secret"
        result, actual = self.apply(original, "60122222222")
        self.assertEqual(0, result.returncode)
        self.assertEqual(original + b"\nWHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER=60122222222\n", actual)

    def test_malformed_or_duplicate_values_fail_closed_without_logging_values(self):
        original = b"POSTGRES_PASSWORD=synthetic-secret\nWHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER=60111111111\n"
        result, actual = self.apply(original, "60122222222;unexpected")
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(original, actual)
        self.assertNotIn("60122222222", result.stdout + result.stderr)
        self.assertNotIn("synthetic-secret", result.stdout + result.stderr)
        duplicate = original + b"WHATSAPP_ASSISTANT_BUSINESS_DISPLAY_NUMBER=60133333333\n"
        result, actual = self.apply(duplicate, "60122222222")
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(duplicate, actual)
        self.assertNotIn("60122222222", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
