from __future__ import annotations


def can_retry(attempts: int, max_retries: int) -> bool:
    return attempts < max_retries


def remaining_retries(attempts: int, max_retries: int) -> int:
    return max(max_retries - attempts, 0)


def is_terminal_failure(attempts: int, max_retries: int) -> bool:
    return attempts >= max_retries
