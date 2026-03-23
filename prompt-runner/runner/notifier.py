"""Lightweight Telegram notification sender.

Sends push notifications via Telegram Bot API when prompts complete, fail,
or the pipeline finishes.  Activated automatically when both environment
variables are set:

    TELEGRAM_BOT_TOKEN  – token from @BotFather
    TELEGRAM_CHAT_ID    – your numeric chat id

Uses only stdlib (urllib) to avoid adding dependencies.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger("prompt_runner")

_BOT_TOKEN_VAR = "TELEGRAM_BOT_TOKEN"
_CHAT_ID_VAR = "TELEGRAM_CHAT_ID"


def _format_elapsed(seconds: float) -> str:
    minutes, secs = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


class TelegramNotifier:
    """Sends messages to a Telegram chat via the Bot API."""

    def __init__(self, bot_token: str, chat_id: str) -> None:
        self.bot_token = bot_token
        self.chat_id = chat_id
        self._api_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    def send(self, text: str) -> bool:
        """Send a plain-text message.  Returns True on success."""
        payload: dict[str, Any] = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self._api_url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status == 200
        except (urllib.error.URLError, OSError) as error:
            logger.warning("Telegram notification failed: %s", error)
            return False

    # ── High-level notification helpers ───────────────────────────────

    def notify_prompt_success(
        self,
        prompt_name: str,
        index: int,
        total: int,
        duration: float,
        completed: int,
        remaining: int,
        failed: int,
    ) -> None:
        elapsed = _format_elapsed(duration)
        self.send(
            f"✅ <b>[{index}/{total}]</b> {prompt_name}\n"
            f"done in {elapsed} | completed: {completed} | "
            f"remaining: {remaining} | failed: {failed}"
        )

    def notify_prompt_failure(
        self,
        prompt_name: str,
        index: int,
        total: int,
        attempt: int,
        max_retries: int,
        error_excerpt: str,
    ) -> None:
        short_error = (error_excerpt or "unknown error")[:200]
        self.send(
            f"❌ <b>[{index}/{total}]</b> {prompt_name}\n"
            f"FAILED attempt {attempt}/{max_retries}\n"
            f"<code>{short_error}</code>"
        )

    def notify_terminal_failure(
        self,
        prompt_name: str,
        index: int,
        total: int,
        independent: bool,
    ) -> None:
        action = "skipping, continuing next" if independent else "pipeline stopped"
        self.send(
            f"🛑 <b>[{index}/{total}]</b> {prompt_name}\n"
            f"Exhausted all retries — {action}"
        )

    def notify_pipeline_finished(
        self,
        completed: int,
        failed: int,
        skipped: int,
        pending: int,
        total: int,
    ) -> None:
        emoji = "🏁" if failed == 0 else "⚠️"
        self.send(
            f"{emoji} <b>Pipeline finished</b>\n"
            f"✅ {completed} | ❌ {failed} | ⏭ {skipped} | ⏳ {pending} | total: {total}"
        )

    def notify_pipeline_started(
        self,
        agent: str,
        model: str,
        total_prompts: int,
        run_id: str,
    ) -> None:
        self.send(
            f"🚀 <b>Pipeline started</b>\n"
            f"agent: {agent} | model: {model or '(default)'}\n"
            f"prompts: {total_prompts} | run: {run_id}"
        )


def create_notifier() -> TelegramNotifier | None:
    """Create a notifier from environment variables, or None if not configured."""
    bot_token = os.environ.get(_BOT_TOKEN_VAR, "").strip()
    chat_id = os.environ.get(_CHAT_ID_VAR, "").strip()

    if not bot_token or not chat_id:
        return None

    notifier = TelegramNotifier(bot_token, chat_id)
    logger.info("Telegram notifications enabled (chat_id=%s)", chat_id)
    return notifier
