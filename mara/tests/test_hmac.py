from mara.security.hmac import sign, verify

SECRET = "test-secret"
BODY = b'{"type":"documents.inserted"}'
T = 1_800_000_000


def test_good_signature_verifies():
    assert verify(SECRET, sign(SECRET, BODY, T), BODY, now=T)


def test_header_format_matches_contract():
    import hashlib
    import hmac

    expected = hmac.new(SECRET.encode(), f"{T}.".encode() + BODY, hashlib.sha256).hexdigest()
    assert sign(SECRET, BODY, T) == f"t={T},v1={expected}"


def test_tampered_body_fails():
    assert not verify(SECRET, sign(SECRET, BODY, T), BODY + b" ", now=T)


def test_wrong_secret_fails():
    assert not verify("other", sign(SECRET, BODY, T), BODY, now=T)


def test_within_tolerance_passes_and_expired_fails():
    header = sign(SECRET, BODY, T)
    assert verify(SECRET, header, BODY, now=T + 300)
    assert verify(SECRET, header, BODY, now=T - 300)
    assert not verify(SECRET, header, BODY, now=T + 301)
    assert not verify(SECRET, header, BODY, now=T - 301)


def test_malformed_or_missing_headers_fail():
    good = sign(SECRET, BODY, T)
    sig = good.split("v1=")[1]
    for header in [
        None,
        "",
        "garbage",
        f"v1={sig}",
        f"t={T}",
        f"t=abc,v1={sig}",
        f"t={T},v1=",
        f"t={T};v1={sig}",
        f"t=-{T},v1={sig}",
    ]:
        assert not verify(SECRET, header, BODY, now=T), header


def test_missing_secret_fails():
    assert not verify(None, sign(SECRET, BODY, T), BODY, now=T)
    assert not verify("", sign(SECRET, BODY, T), BODY, now=T)
