import re

import pytest
import yaml

from mara import checker as ck
from mara.config import (
    ROOT_DIRS,
    config_dir,
    load_document_types,
    load_messages,
    load_reminders,
    load_standard,
)
from tests.conftest import SCHEMA_SQL

KEYS = {
    "buyer_rep_agreement",
    "sales_contract",
    "sellers_disclosure",
    "lead_paint_addendum",
    "preapproval_letter",
    "hoa_addendum",
}


def test_document_types_match_the_contract_and_the_db_seed():
    types = load_document_types()
    assert {t.key for t in types} == KEYS
    seeded = set(re.findall(r"^\s*\('([a-z_]+)',\s*'", SCHEMA_SQL.read_text(), re.M))
    assert {t.key for t in types} == seeded


@pytest.mark.parametrize("t", load_document_types(), ids=lambda t: t.key)
def test_every_standard_parses_and_is_named_after_its_type(t):
    s = load_standard(t.standard_key)
    assert s.key == t.standard_key and s.rules()


def test_every_standard_file_belongs_to_a_type():
    files = {p.stem for p in (config_dir() / "standards").glob("*.yaml")}
    assert files == {t.standard_key for t in load_document_types()}


def test_reminders_and_messages_parse():
    r = load_reminders()
    assert r.send_hour_local == 10 and r.max_per_client_per_day == 1
    m = load_messages()
    for text in (m.invite, m.reminder, m.fix_request_footer):
        assert "{portal_link}" in text
    assert "Cedar & Stone Realty" in m.invite and "{code}" in m.verify_code


def test_prompt_has_version_header_and_the_guardrails():
    body, version = ck.load_prompt()
    assert version == "check-document@v2"
    assert "legal or financial advice" in body and "wiring" in body
    raw = (ROOT_DIRS["prompts"] / "check_document.md").read_text()
    assert yaml.safe_load(raw.split("---")[1])["version"] == 2
