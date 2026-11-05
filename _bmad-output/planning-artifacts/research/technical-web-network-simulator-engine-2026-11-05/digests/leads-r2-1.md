# Digest leads-r2-1 (round 2, lead-following) — 2026-11-05

Scope: L1 trademark "PACKET TRACER", L2 hosting constraints, L3 frontend licences/versions.
Budget used: 18 tool calls before writing; 7 pages read in full, the rest are search-result snippets (marked "snippet").
Method caveat: page reads went through a fetch tool that returns a model-written extract, not raw HTML. Quotes below are as returned by that tool; re-open the page before relying on any quote in a legal or contractual context.

**Headline answers**

- L1: NOT RESOLVED. No registry record of a "PACKET TRACER" mark owned by Cisco was found, but no registry was read directly, so absence is not established. Only an abandoned one-word "PACKETTRACER" US application (not shown to be Cisco's) surfaced.
- L2: Oracle Cloud Always Free gives real VMs (now 2 OCPU / 12 GB Arm total, plus two 1 GB AMD micro VMs). Google Cloud Run's docs explicitly refuse privileged containers and added capabilities. No official statement was retrieved for Render, Railway, Fly.io or Koyeb; Railway and Fly.io evidence is forum-only.
- L3: xterm.js LICENSE carries MIT-style permission text; React Flow is MIT and its docs tie attribution removal to a React Flow Pro subscription; Cytoscape.js is 3.34.4, MIT.

## Findings

### L1 — Trademark

1. Cisco's own trademark list page does not contain an entry for "Packet Tracer" or "Cisco Packet Tracer" (entries read around P: Open Pay, OpenDNS, OpFlex, Outshift, PhishTank, Prisma, Q100...). The same page states "the absence of any mark from this list does not mean that it is not a Cisco trademark." So this is neither proof of registration nor proof of non-registration. | https://www.cisco.com/c/en/us/about/legal/trademarks.html | Cisco Systems | undated | accessed 2026-11-05 | medium (list may load partially) | trademark

2. A US application for the one-word mark PACKETTRACER exists: serial 78346123, standard character mark, filed 2003-12-29, status abandoned (failure to respond or late response), status date 2008-01-24, goods described as networking hardware, optical media and downloadable software. No registration number was shown. Read from a search snippet of the Justia record; the record page itself returned HTTP 403. | https://trademarks.justia.com/783/46/packettracer-78346123.html | Justia Trademarks (mirror of USPTO data) | undated | accessed 2026-11-05 | medium for serial/status/dates (snippet), not verified on TSDR | trademark

3. Owner of serial 78346123 was NOT read from the record. A Justia owner page for "Cyber Solutions, Inc." appeared in the same result set, and the search summary associated it with this serial; that link is an inference from a result listing, not a read record. If correct, the applicant was not Cisco. | https://trademarks.justia.com/owners/cyber-solutions-inc-1076538 | Justia Trademarks | undated | accessed 2026-11-05 | low (snippet, inferred) | trademark

4. Near-miss marks that are not "PACKET TRACER": (a) PACKET, serial 75507341, registration 2434500, owner CISCO TECHNOLOGY, INC., filed 1998-06-23, registered 2001-03-13, status dead; (b) PACKET TRACKER, serial 78190017, abandoned, owner not read. Neither covers the phrase in question. | https://markinton.com/trademark/packet-75507341 ; https://trademarks.justia.com/781/90/packet-tracker-78190017.html | Markinton (aggregator); Justia Trademarks | undated | accessed 2026-11-05 | low (snippets, aggregator) | trademark

5. Across two standard searches and one extended search, no source returned a live or dead application or registration for "PACKET TRACER" (two words) or "CISCO PACKET TRACER" in the name of Cisco Technology, Inc. or Cisco Systems, Inc., in the US, EU, WIPO or Korea. This is a negative search result only; see "could not find". | search results, no single URL | — | — | accessed 2026-11-05 | low (absence of evidence) | trademark

6. The only trademark symbol seen next to the name was a third-party site writing "Packet Tracer™" in a disclaimer attributing marks to Cisco Systems, Inc. This is marketing/disclaimer use by a non-owner and is not evidence of registration. | https://packetmentor.com/blog/cisco-packet-tracer-free-download/ | PacketMentor (third-party blog) | 2026 (per search summary) | accessed 2026-11-05 | low (snippet, non-primary) | trademark

### L2 — Hosting

7. Oracle Cloud Always Free, Arm: "All tenancies get the first 1,500 OCPU hours and 9,000 GB hours per month for free for VM instances using the VM.Standard.A1.Flex shape"; "For Always Free tenancies, this is equivalent to 2 OCPUs and 12 GB of memory." Usable as one instance or up to two 1-OCPU instances. This is half the 4 OCPU / 24 GB figure that older guides repeat; secondary reports in search snippets (fullmetalbrackets.com, next.ink) say the cut took effect in June 2026. | https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm | Oracle (official docs) | undated (footer © 2026) | accessed 2026-11-05 | high for current figures; low for the June 2026 change date (snippet) | pricing

8. Oracle Cloud Always Free, AMD: "All tenancies get up to two Always Free VM instances using the VM.Standard.E2.1.Micro shape"; each has "1/8th of an OCPU with the ability to use additional CPU resources", 1 GB memory, one VNIC with one public IP, "up to 50 Mbps network bandwidth". | same URL as 7 | Oracle (official docs) | undated (footer © 2026) | accessed 2026-11-05 | high | pricing

9. Oracle Cloud Always Free storage: 200 GB Block Volume total (boot and block volumes combined) and five volume backups. The page is internally inconsistent on minimum boot volume size (47 GB in the Compute section, 50 GB in the Block Volume section). | same URL as 7 | Oracle (official docs) | undated (footer © 2026) | accessed 2026-11-05 | high | pricing

10. Oracle idle rule: instances are deemed idle if, over a 7-day period, 95th-percentile CPU utilisation is under 20%, network utilisation is under 20%, and (A1 shapes only) memory utilisation is under 20%. A low-traffic class server could meet this definition. The consequence wording (reclamation) was not captured in the extract. | same URL as 7 | Oracle (official docs) | undated (footer © 2026) | accessed 2026-11-05 | high for thresholds; medium for consequence | capability

11. Google Cloud Run does not permit what a namespace/veth/bridge emulator needs: "Cloud Run doesn't support privileged containers."; "There is no Cloud Run equivalent to Docker's `--privileged` mode."; containers cannot perform "Adding or removing Linux kernel capabilities"; "Privilege escalation is also disabled"; `sudo` and `setuid` binaries are unsupported. First-generation environment is sandboxed with gVisor; second generation offers "full Linux compatibility" but containers still run "under user, network, PID, and other Linux namespaces", which "restricts some network capabilities". | https://docs.cloud.google.com/run/docs/container-contract | Google Cloud (official docs) | undated in extract | accessed 2026-11-05 | high | capability

12. Render's Docker documentation page says nothing either way about privileged mode, root, Linux capabilities or cap-add. Silence, not a permission. | https://render.com/docs/docker | Render (official docs) | undated | accessed 2026-11-05 | medium (single page checked) | capability

13. FORUM ONLY — Railway: on Railway's help station a staff reply to an OpenVPN/TUN question said the company cannot grant CAP_NET_ADMIN, and a feature request for "/dev/net/tun or NET_ADMIN capability for containers" is listed as under review. No official Railway docs page was retrieved. | https://station.railway.com/questions/access-to-tun-request-to-host-an-open-vpn-224464bb ; https://station.railway.com/feedback/request-dev-net-tun-or-net-admin-capab-a9470a3f | Railway help station (forum) | undated ("about three months ago" per snippet) | accessed 2026-11-05 | low (forum, snippet) | capability

14. FORUM ONLY — Fly.io: a community thread titled "feature request: set CAP_NET_ADMIN" exists; the poster's workaround was running as root and staff said more such features were planned. Whether Fly.io Machines currently allow netns/veth/bridge creation, and whether any free allowance exists, was not established. | https://community.fly.io/t/feature-request-set-cap-net-admin/3074 | Fly.io community forum | undated (old thread per snippet) | accessed 2026-11-05 | low (forum, snippet) | capability

### L3 — Frontend licences and versions

15. xterm.js repository LICENSE contains the MIT-style grant ("Permission is hereby granted, free of charge, to any person obtaining a copy...") with copyright lines for the xterm.js authors (2017-2019), SourceLair Private Company (2014-2016) and Christopher Jeffrey (2012-2013). The extract did not show the literal label "MIT" in the file. | https://raw.githubusercontent.com/xtermjs/xterm.js/master/LICENSE | xtermjs (GitHub repository) | undated (copyright years 2012-2019) | accessed 2026-11-05 | high | licensing

16. React Flow attribution rule, as stated on its docs page: "React Flow is open-source MIT-licensed software."; "Subscribing to React Flow Pro permits you to remove the attribution from your flows."; "Only remove this attribution, if you are subscribed to React Flow Pro." The extract did not show the mechanism (no `proOptions` / `hideAttribution` text was returned) nor any personal-project exemption. Practical reading for a zero-budget student project: keep the badge. | https://reactflow.dev/learn/troubleshooting/remove-attribution | xyflow (React Flow docs) | undated (footer © 2026) | accessed 2026-11-05 | medium (model-written extract; re-read exact wording) | licensing

17. Cytoscape.js: npm registry "latest" is version 3.34.4, licence field "MIT", repository github.com/cytoscape/cytoscape.js. | https://registry.npmjs.org/cytoscape/latest | npm registry (package metadata published by Cytoscape maintainers) | undated | accessed 2026-11-05 | high | version / licensing

## Looked for but could not find

- **Any trademark registry read directly.** USPTO Trademark Search and TSDR, WIPO Global Brand Database, EUIPO eSearch and KIPRIS were not read: they are script-driven search applications that the fetch tool cannot operate, and the one mirror page attempted (Justia record 78346123) returned HTTP 403. L1 therefore remains open. No Cisco-owned "PACKET TRACER" record was found, and that must not be reported as "not registered". A manual query of the four registries (word mark "PACKET TRACER" and "PACKETTRACER", owner "Cisco") is still needed.
- **Owner and prosecution history of serial 78346123** (only an inferred link to Cyber Solutions, Inc.).
- **Explicit root-access wording** for Oracle Always Free VMs, and an explicit statement of how long Always Free lasts. The page describes them as VM compute instances available to "all tenancies"; nothing on root/sudo or duration was captured.
- **Google Cloud free tier (e2-micro VM) and AWS free tier** terms: not retrieved (Google page redirected and the budget ran out; AWS never queried).
- **Official documentation statements on privileged mode or NET_ADMIN for Render, Railway, Fly.io and Koyeb.** Render's Docker page is silent; Railway and Fly.io are forum-only; Koyeb produced nothing.
- **Free static hosting limits** for GitHub Pages, Cloudflare Pages, Vercel and Netlify: not retrieved.
- **Current major version of @xyflow/react**: not retrieved. The `hideAttribution` mechanism was also not confirmed.
- **Cytoscape.js repository LICENSE file**: not read; the MIT finding rests on npm registry metadata.
