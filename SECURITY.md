# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainer directly or use [GitHub's private vulnerability reporting](https://github.com/chandrameenamohan/forward-check-ai/security/advisories/new)
3. Include a description of the vulnerability and steps to reproduce

We aim to respond within 48 hours and will work with you to understand and address the issue.

## Scope

This project handles user-submitted text for fact-checking. Security concerns include:
- Prompt injection attacks against the AI pipeline
- XSS in web interface
- Rate limiting bypass
- Database injection
- Telegram bot abuse
