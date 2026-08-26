# Illegal Content Risk Assessment — Virtual Rishta Naata

**Prepared:** 2026-08-26
**Applies to:** virtualrishtanaata.com and the Virtual Rishta Naata Android/iOS app
**Review cadence:** at least annually, and immediately after any material change to the service (new user-generated content feature, a significant safety incident, or a relevant change in Ofcom guidance)
**Status:** internal working document. This assessment was prepared as part of an in-house compliance review, not by a solicitor — see "Limitations" at the end before relying on it for a regulatory filing or defence.

This document exists because the Online Safety Act 2023's illegal-content duties (Online Safety Act 2023, s.10) apply to essentially any "user-to-user" internet service with a significant number of UK users, or UK users as a target market — that includes services built around private messaging between users, not just public social feeds. Virtual Rishta Naata is a UK-focused, invite-free matrimonial platform for the Ahmadi Muslim community, built entirely around member profiles and private one-to-one messaging, so this duty applies regardless of the platform's size. Unlike the Act's additional duties for "Category 1" services (large platforms, mainly relevant to adult-content and disinformation transparency obligations), the base illegal-content duties apply to every in-scope service — there is no size threshold to opt out of them.

## 1. Service description

- **What it is:** a subscription matrimonial platform for Ahmadi Muslims. Members create a profile (photo optional), which is reviewed and approved by a human admin before it becomes visible to anyone else. Approved, paying (or comped) members can browse other approved profiles and exchange private one-to-one text messages.
- **Who can join:** adults only — signup enforces a hard minimum age of 18 at the database level (`profiles.age` constrained to 18–90), not just a self-certification checkbox.
- **User-generated content surfaces:** profile text fields (bio, preferences, background details), an optional profile photo, an optional "Ahmadi Verification" text/video submission (visible only to admins, deleted after review), and private messages between two matched members.
- **What is NOT present:** no public posts, no public comments, no group chats, no file/media sharing inside messages, no way for a non-member to view any member content, no search engine indexing of profile content.

## 2. Risk assessment methodology

Each relevant illegal-content category under the Act's Schedule 7 (priority offences) is assessed for (a) likelihood, given the service's actual features and audience, and (b) severity if it did occur, then matched against the mitigations already in place. Categories with no plausible pathway on this service (e.g. content promoting terrorism, which has no realistic foothold in private matrimonial profiles/messaging) are noted as out-of-scope with the reasoning, rather than omitted silently.

## 3. Risk-by-category

### Child sexual exploitation and abuse (CSEA) — the primary relevant risk

- **Likelihood:** low, but not zero — any service allowing photo uploads and private messaging carries some baseline risk of misuse, and this is the category the Act treats most seriously regardless of a service's size.
- **Severity if it occurred:** very high.
- **Mitigations in place:**
  - Hard 18+ enforcement at signup (see §1).
  - No profile — including any photo — becomes visible to any other member until a human admin has reviewed and approved it (`profile_status`, `photo_status`). This is a meaningful control specific to this platform's design: unlike an open social feed, nothing reaches another user pre-moderation.
  - In-app reporting on every profile and every individual message, routed straight to the admin team (`profile_reports` table; `messages.reported`/`reported_reason`).
  - Blocking, independent of reporting, lets a member unilaterally cut off contact (`blocks` table).
  - A published Child Safety Standards policy (`child-safety.html`) stating zero tolerance, the reporting routes available, and a designated contact (`contact@virtualrishtanaata.com`), plus a commitment to cooperate with law enforcement and report to NCMEC where applicable.
  - Every admin moderation action (approve/reject a profile or photo, delete an account, view a reported conversation) is written to a permanent audit log (`admin_action_log`), so moderation decisions are traceable after the fact.
- **Residual risk / gaps:** no automated image-hashing (e.g. PhotoDNA/CSAM-matching) is currently run against uploaded photos — moderation relies on human review at approval time. Given the platform's current scale, this is a proportionate starting point, but should be revisited if member/photo volume grows materially.

### Harassment, stalking, and abusive communications

- **Likelihood:** low-to-moderate — private one-to-one messaging between vetted, paying adult members reduces (but doesn't eliminate) this compared to an open platform.
- **Severity:** moderate.
- **Mitigations:** per-message and per-profile reporting, blocking, Community Guidelines (`guidelines.html`) prohibiting harassment, and admin ability to review the full conversation context around a flagged message before deciding (not just the single flagged message in isolation).

### Fraud and financial harm (e.g. romance scams, visa/immigration-motivated marriage fraud)

- **Likelihood:** moderate — matrimonial platforms are a known target for this category generally, though anonymity controls here (no public contact details shown, no name displayed to other members, in-app-only messaging) reduce some common vectors.
- **Severity:** moderate-to-high for an affected individual.
- **Mitigations:** Terms of Use explicitly prohibit seeking marriage for immigration purposes and misrepresenting personal circumstances, with immediate removal and no refund as the stated consequence (`terms.html` §6); contact email is never exposed to other members, reducing off-platform follow-through by bad actors; reporting/blocking as above.

### Content promoting terrorism, or extremism

- **Likelihood:** negligible — no plausible feature pathway (no public posts, no groups, no broadcast capability); out of scope for further mitigation beyond standard reporting/removal capability, which already exists for any content type via profile/message reporting.

### Hate offences

- **Likelihood:** low, given the platform's homogeneous, vetted membership and lack of public content — covered by the same reporting/removal tooling as harassment above.

## 4. Cross-cutting systems (apply across all categories)

- **Reporting:** available on every profile and every message, in-app, routed to admins.
- **Removal:** admins can reject a pending profile, reject a photo, or delete an account entirely (`admin-review-profile`, `admin-review-photo`, `admin-delete-profile`), all logged.
- **Record-keeping:** `admin_action_log` retains every moderation decision permanently, which is also what allows this risk assessment to be checked against real outcomes over time rather than just intentions.
- **Escalation to authorities:** stated commitment in `child-safety.html` to cooperate with law enforcement and report CSEA to NCMEC where applicable.

## 5. Summary judgement

Given the service's design — mandatory pre-moderation before any content reaches another user, adult-only enforcement, no public content surface, and working report/block tooling with an audit trail — the overall illegal-content risk profile is assessed as **low relative to a typical user-to-user service**, with CSEA remaining the category warranting the most ongoing attention given its severity, notwithstanding a low likelihood. The main identified gap is the absence of automated CSAM image-scanning, noted above as a candidate for revisiting as the platform grows.

## Limitations

This document was prepared in-house as a working risk assessment, following the general shape of Ofcom's published guidance for illegal-content risk assessments. It has **not** been reviewed by a solicitor or by Ofcom, and the Online Safety Act's categorisation rules (which affect what additional duties, if any, apply beyond the base illegal-content duty) are genuinely fact-specific. Before relying on this for a regulatory response, an audit, or as a legal defence, get it reviewed by a solicitor with OSA experience.
