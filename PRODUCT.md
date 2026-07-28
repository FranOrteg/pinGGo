# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

All departments of an organization. Users range from technical teams to business staff who need real-time internal communication integrated with their daily workflows.

## Product Purpose

PinGGo is an internal messaging platform that centralizes team communication within the Skylab ecosystem. It enables channels, direct messages, file sharing, and real-time collaboration — keeping conversations connected to the projects and tools teams already use.

## Positioning

Deep integration with the Skylab platform: user synchronization, project-linked conversations, and cross-tool notifications. Slack for companies working within the Skylab ecosystem, PinGGo is purpose-built for the organization's specific workflows and data.

## Operating Context

- Daily internal communication across departments
- Project-based discussions linked to Skylab modules
- Real-time messaging with presence, typing indicators, and read receipts
- File sharing and media storage via S3
- Multi-device web access (responsive)

## Capabilities and Constraints

- Channels (public/private), Direct Messages, Group conversations
- Real-time messaging via WebSockets (Socket.IO)
- File attachments with S3 presigned URLs
- User presence indicators (online/away/dnd/offline)
- Message reactions, editing, deletion
- Typing indicators and unread counts
- Authentication with JWT + httpOnly refresh cookies
- Backend: Express + MySQL + Redis
- Frontend: SvelteKit + Socket.IO client

## Brand Commitments

Name: PinGGo. No other brand constraints confirmed.

## Evidence on Hand

Full working implementation with login, chat, channels, DMs, file uploads, and real-time messaging. Codebase spans SvelteKit frontend and Express backend.

## Product Principles

1. **Integrated, not isolated** — conversations connect to Skylab's data and workflows
2. **Simple by default** — essential messaging without overwhelming feature bloat
3. **Real-time first** — instant delivery, presence, and typing feedback
4. **Self-hosted control** — data stays within the organization's infrastructure

## Accessibility & Inclusion

No formal WCAG certification required. Good accessibility practices desired as a quality baseline.
