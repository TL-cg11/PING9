# Verification R1-1 (accessed 2026-11-05)

Budget: 18 research/tool calls used of 20 (limit reached). Two fetches failed (noted under "Could not check"). Everything below comes from pages opened this run unless explicitly marked "snippet only".

## Summary

| Claim | Status |
|---|---|
| C1 | unverified by an independent publisher (wording confirmed on a second VyOS doc branch; the one independent source gives different figures) |
| C2 | unverified (one low-authority third-party page conflicts) |
| C3 | unverified (both independent sources failed to load) |
| C4 | verified in substance, with corrections and gaps |
| C5 | partly verified (capability requirement yes; Docker default not independently checked) |
| C6 | repository facts confirmed by direct inspection |

## Per claim

### C1 | unverified by an independent publisher

- **Same-publisher corroboration (not independent):** the VyOS 1.4 installation page states: "The minimum system requirements are 4 GB RAM and 10 GB storage." The page also refers to "Starting with 1.4.3". So the 4 GB / 10 GB wording is not limited to the rolling branch.
  - https://docs.vyos.io/en/1.4/installation/install.html | VyOS (docs.vyos.io) | undated | accessed 2026-11-05
- **VyOS 1.3 (equuleus) docs:** "The minimum system requirements are 512 MiB RAM and 2 GiB storage." This is the vendor's own earlier, much lower figure.
  - https://docs.vyos.io/en/1.3/installation/install.html | VyOS (docs.vyos.io) | undated | accessed 2026-11-05
- **Independent source, materially different figures:** 8Labs Docs lists minimum "2 GB RAM, 8 GB storage, 1 CPU core" and production "4 GB RAM, 20+ GB storage". It cites no source and does not say whether the figures come from testing. It does not mention 512 MB or 1 GB.
  - https://8labs.id/guides/vyos/installation/ | 8Labs | last updated 2026-11-02 | accessed 2026-11-05
- **Running in less RAM:** no independent report was opened. The only evidence retrieved is the VyOS 1.3 docs figure above (512 MiB).
- **Snippet only, not opened:** a VyOS support knowledge-base article reportedly puts the floor at 1 GB and says less "may still work in some cases, but not recommended"; a third-party mirror labelled "1.5.x (circinus)" reportedly shows 1024 MiB / 2 GiB. If accurate, the documented minimum has moved 512 MiB -> 1024 MiB -> 4 GB across versions. The rolling-branch page itself was not re-opened this run.

### C2 | unverified

- **Wikipedia "VyOS"** (opened): lists only 1.3.0 (Equuleus), released 2021-12-21. No 1.3.x point releases, no 1.3.8, no end-of-life statement.
  - https://en.wikipedia.org/wiki/VyOS | Wikipedia | last edited 2026-09-18 | accessed 2026-11-05
- **Conflicting third-party page:** 8Labs Docs lists 1.3 Equuleus as "Maintenance only", says it "receives security patches" and "will eventually reach EOL", i.e. presents it as not yet end of life. Unsourced and low authority, so I do not treat this as overturning the claim.
  - https://8labs.id/guides/vyos/installation/ | 8Labs | last updated 2026-11-02 | accessed 2026-11-05
- **Snippet only, not opened:** docs.vyos.io rolling "History" page reportedly says Equuleus "reached the end of support in 2025" (same publisher as the first source). HandWiki reportedly lists 1.3.8 dated 2024-06-24. Neither the "March 2025" announcement month nor "1.3.8 is the last release" was confirmed on any opened page.

### C3 | unverified

- No independent page could be opened. The ASEE paper (peer.asee.org/26285.pdf) returned unreadable binary PDF; packettracernetwork.com refused the connection.
- **Snippet only, not opened:** search results describe Packet Tracer as a simulator using "a software-defined virtual operating system" rather than the real router OS, not supporting all commands of a real Cisco device, and Packet Tracer 8.2 having "only a subset of the BGP functionalities of a real Cisco ISR router". These are consistent with the claim but are not evidence under the brief's rules.

### C4 | verified in substance, with corrections and gaps

Two full sources opened.

- **EFF case page:** "A jury rightly found that Arista was not liable for copyright infringement based on a doctrine known as" "scènes à faire." Cisco appealed to the Federal Circuit; oral argument was heard in June 2018; "before the appeal could be decided, in August 2018 Cisco and Arista settled this case." The page's docket list shows: motion for indicative ruling to vacate judgment (2018-09-04), order granting indicative ruling (2018-09-05), motion to the Federal Circuit for limited remand (2018-09-06), order granting limited remand (2018-09-10), motion to vacate judgment after remand (2018-09-26), order vacating the district court judgment (2018-10-01).
  - https://www.eff.org/cases/cisco-systems-v-arista-networks | Electronic Frontier Foundation | undated (latest listed event October 2018) | accessed 2026-11-05
- **The Register:** "Arista will pay US$400m to Cisco by August 20." The one case surviving the truce is Cisco's appeal "against a copyright judgment in Arista's favor", which "will continue"; Arista agreed to further "limited" CLI changes "if the case is remanded or reversed". The article describes the 2016 outcome loosely as a ruling that Arista's command interface "did not infringe" and does not mention the jury's reasoning.
  - https://www.theregister.com/2018/08/06/arista_cisco_agreement/ | The Register (Richard Chirgwin) | 2018-08-07 (00:24 UTC; URL dated 2018-08-06) | accessed 2026-11-05

**Precise answers:**

1. *Infringed-but-excused, or not protected?* The opened evidence says the jury found Arista **not liable on the basis of the scènes à faire defence**. That is a defence to liability, not a finding that the CLI is unprotectable. Neither opened source reproduces the verdict form, so the step "the jury first found copying/infringement" is not confirmed by an opened page. A search snippet (not opened) says the jury "found that Arista had infringed the copyright on at least one of Cisco's command line interfaces, but that the interface was..." (cut off), which points the same way. The Register's "did not infringe" wording is imprecise against EFF's.
2. *How did the appeal end?* Not by a merits decision, and not by a simple dismissal. Per the EFF docket list, the Federal Circuit granted a **limited remand** (2018-09-10) and the district court then **vacated its judgment** (2018-10-01) at the parties' request under the settlement. Note the tension in timing: The Register reported on 2018-08-07 that the appeal "will continue"; the EFF record shows it was ended by remand and vacatur within two months.
3. *Correction to the claim:* "the appeal ended without a merits decision" is right but incomplete. The judgment on the jury verdict was vacated, so the verdict does not stand as a judgment.

**Not confirmed on any opened page:** the month "December" 2016 (The Register only links to a 2016 article), the case number 5:14-cv-05344, and the N.D. Cal. venue.

### C5 | partly verified

- **Requirement for CAP_NET_ADMIN: verified.** capabilities(7) lists under CAP_NET_ADMIN, among others, "interface configuration" and "modify routing tables".
  - https://man7.org/linux/man-pages/man7/capabilities.7.html | Linux man-pages project (man7.org, Michael Kerrisk) | man-pages 6.19, dated 2026-02-08; HTML rendered 2026-09-09 | accessed 2026-11-05
- Caveat: the man page says "interface configuration" generally; it does not name veth pair creation. veth(4) and network_namespaces(7) were not opened.
- **"Docker does not grant it by default": not independently checked** (budget). This half rests on the first source only.

### C6 | repository confirmed by direct inspection (no independent publisher, as instructed)

- **Exists, name and purpose:** repository description reads "GEduNet is an Graphical Educational Computer Network Simulator", aimed at students and teachers of computer networks.
- **License / language:** MIT; primary language TypeScript.
- **Browser-only:** README states "The project runs on the browser and is hosted in GitHub Pages." No backend is mentioned.
- **Features in README:** ARP (requests, ARP tables on hosts and routers), switches that learn source MACs and flood unknown destinations, manually editable static routing tables, ICMP echo request/reply (types 8 and 0). It also goes beyond the claim: HTTP client/server programs over TCP with Reno or Tahoe, per-layer views, JSON save/load, PNG export, router packet queues.
- **First activity:** repository created 2024-09-23.
- **Last activity:** last push 2025-07-06 (API field pushed_at = 2025-07-06T23:46:38Z). This is the last push to any branch; the last commit on main was not separately displayed. No pushes for about 16 months as of 2026-11-05. Active period roughly 9.5 months.
- **Contributors:** 4 (MegaRedHand 95, pgallino 54, Manuel-Pol 23, V-SANT 13 contributions; total 185, matching the 185 commits shown on the repo page).
- **Live demo:** yes, GitHub Pages is enabled and the homepage is https://megaredhand.github.io/network-simulator/ . The demo page itself was not opened, so I did not confirm it currently loads.
- **Other:** 9 stars, 0 forks, not archived, topics educational / fiuba / network-simulator / ta048, 8 open issues and 1 open pull request. No releases were shown on the page.
- Sources: https://github.com/MegaRedHand/network-simulator ; https://api.github.com/repos/MegaRedHand/network-simulator ; https://api.github.com/repos/MegaRedHand/network-simulator/contributors | GitHub (repository owner MegaRedHand) | repo created 2024-09-23, last push 2025-07-06 | accessed 2026-11-05

## Could not check

- **C3 entirely:** peer.asee.org/26285.pdf returned unreadable binary; packettracernetwork.com refused the connection (ECONNREFUSED). No independent page was read.
- **C2:** the "March 2025" announcement and "1.3.8 is the last release" were not found on any opened independent page.
- **C1:** no independent publisher confirming 4 GB / 10 GB; no independent report of VyOS running in less RAM; the VyOS support KB article (1 GB floor) and the rolling-branch page were not opened.
- **C4:** the verdict form itself, the December 2016 date, the case number and venue. Candidate sources seen in search but not opened: IPWatchdog (2017-01-12), The Recorder / law.com (2018-09-07), EFF-hosted appeal briefs.
- **C5:** Docker's default capability set from a non-Docker source; veth(4) and network_namespaces(7).
- **C6:** whether the hosted demo actually loads; date of the last commit on main as distinct from the last push.
