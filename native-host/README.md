# Local AI connection

The helper uses your signed-in **Codex** account by preference, or Claude Code when Codex is not installed. The selected provider is pinned by the installer and displayed in the sidebar. It never switches providers after a failed request, and no API key or Jobright credit is used. Normal account plan usage and limits still apply. A connected CLI/auth status does not guarantee remaining plan access; a real inference may still fail.

1. Install Codex from its official source and sign in with ChatGPT (or install and sign in to Claude Code if Codex is absent).
2. Load the production extension in Chrome and copy its extension ID from its sidebar settings.
3. In this project, run `node scripts/install-ai-host.mjs --extension-id YOUR_EXTENSION_ID`.
4. Choose **Check connection** under **AI connection** in the sidebar. Chrome's native messaging permission is declared at installation; there is no additional runtime permission prompt. AI stays disabled until you enable it.

Chrome can leave `connectNative` unavailable in an already-running extension worker after an optional permission grant. This release declares the same permission at installation to avoid a first-time setup reload.

The installer supports macOS and Linux Google Chrome. It registers `com.jobapply.ai` for exactly the supplied extension origin. It discovers an installed binary locally; browser messages cannot select an executable, shell command, provider or file path. It installs the helper under `~/.local/share/job-apply-assistant/native-host`, not a web server or background daemon. Chrome starts it only when the extension connects. Re-run the installer after changing the unpacked extension ID or upgrading this helper. Windows is not supported yet.

Every draft uses a fresh temporary directory. The helper sends only the draft request through stdin, validates the CLI's account type, and passes an allowlisted environment without API keys or provider overrides. It does not open or copy authentication files. The CLI handles its own sign-in. The helper does not persist prompts or answers; the extension's existing answer validation still checks the result.

Codex runs `exec --ignore-user-config --ignore-rules --ephemeral --sandbox read-only`, with forced ChatGPT auth and the OpenAI provider. Shell, code-mode execution host, image viewing, apps, plugins, MCP, browser, computer, multi-agent, memory, hooks and web search are disabled. Project instruction discovery is disabled. JSONL must contain a completed turn and an answer; tool events and unexpected errors are rejected. Current Codex emits a specific benign notice that its deliberately disabled code-mode host will fail closed; this one exact notice is allowed. Codex does not expose a documented universal no-tools flag: some built-in tool metadata may remain, so this is a restricted execution configuration, not a claim that every model's catalog is empty. The read-only sandbox and disabled execution hosts remain active. The synthetic live smoke produced only an answer and completion (plus that notice), with no tool events.

Claude uses `--safe-mode --restricted --tools '' --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources '' --disable-slash-commands --no-chrome --no-session-persistence --permission-prompts none`. Auth must be `claude.ai`. The locally installed Claude account passed auth checks, but the real synthetic request was refused with `oauth_not_allowed_for_organization` before inference; no API-key fallback was used. Do not call this a successful live Claude integration test.

Closing/cancelling the request disconnects the native port and aborts its child process group. Each inference has a 60-second deadline and bounded output. Authentication checks have a 10-second deadline. Failures leave basic autofill usable; there is no paid or alternate-provider fallback.

Run helper tests with `node --test tests/native/*.test.mjs`. Browser-client tests run with the repository's unit suite. Real smoke tests must use synthetic facts. A test with a stub process validates framing and cancellation but is not evidence of a live account request.

Official CLI references: [Claude Code CLI](https://code.claude.com/docs/en/cli-reference), [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode). The installed Claude CLI help also explicitly documents `--tools ""`, `--safe-mode`, and `--strict-mcp-config`.
