# Digest: lab orchestration platforms as a possible backend (lab-platforms-r1-1)

Run date: 2026-11-05. Budget used: 8 pages opened, 8 searches. Claims marked "search snippet" come from a search-result summary of a page that was not opened; they are leads with a URL, not verified readings.

## Findings

### containerlab

1. containerlab is a command-line tool that starts containers, wires them into user-defined lab topologies and manages the lab lifecycle; the repo shows about 2.9k stars. | https://github.com/srl-labs/containerlab | srl-labs (Nokia) GitHub repo | undated (live repo page) | accessed 2026-11-05 | high | capability

2. containerlab is licensed BSD-3-Clause (repo sidebar and LICENSE file). | https://github.com/srl-labs/containerlab | srl-labs GitHub repo | undated | accessed 2026-11-05 | high | licensing

3. The release marked "Latest" is v0.82.0, dated 23 Oct 2026; before it v0.81.1 (15 Oct), v0.81.0 (11 Oct), v0.80.0 (9 Oct), v0.79.0 (21 Aug). Cadence is roughly one or more releases per month. Caveat: the list shows day and month; the year was inferred from asset timestamps by the fetch tool. | https://github.com/srl-labs/containerlab/releases | srl-labs GitHub releases | 2026-10-23 | accessed 2026-11-05 | medium-high | version

4. The kinds table includes `frr` (FRRouting, container), `linux` (generic Linux container), `bridge` (Linux bridge), `ovs-bridge` (Open vSwitch bridge), `host`, `nokia_srlinux`, `arista_ceos` and `cisco_iol` (containers). VyOS is listed as `vyosnetworks_vyos` with packaging "VM", not a native container. | https://containerlab.dev/manual/kinds/ | containerlab.dev official docs | undated | accessed 2026-11-05 | high | capability

5. Host requirements: a Linux host with Docker; "A user should have `sudo` privileges to run containerlab." Package installs set the binary SUID for sudo-less operation, and privileged commands are restricted to the `clab_admins` Unix group, whose members are effectively root-equivalent. Windows works only through WSL; macOS is supported. | https://containerlab.dev/install/ | containerlab.dev official docs | undated | accessed 2026-11-05 | high | security

6. The install page gives no per-node sizing: a footnote says "Most containerized NOS will require >1 vCPU" and RAM "depends on the lab size." | https://containerlab.dev/install/ | containerlab.dev official docs | undated | accessed 2026-11-05 | high | performance-scale

7. A separate REST API exists: `srl-labs/clab-api-server` ("The api-server for containerlab"), Apache-2.0, covering deploy, destroy, inspect, node exec, SSH access and logs. It is small: 31 stars, 15 forks, 426 commits. No "experimental" or production-readiness statement is on the page. | https://github.com/srl-labs/clab-api-server | srl-labs GitHub repo | undated | accessed 2026-11-05 | high | capability

8. clab-api-server's multi-user model is Linux system accounts checked via PAM (groups `clab_api` / `clab_admins`), issuing a JWT (default 24 h). Lab ownership is tracked by container labels; regular users manage their own labs, superusers all labs. Each end user therefore needs a Linux account on the host. | https://github.com/srl-labs/clab-api-server | srl-labs GitHub repo | undated | accessed 2026-11-05 | high | security

9. clab-api-server runs as root under systemd; its Docker example runs privileged with host networking and host PID and mounts the Docker socket and host account files. | https://github.com/srl-labs/clab-api-server | srl-labs GitHub repo | undated | accessed 2026-11-05 | high | security

10. Release 0.76 (3 Jun 2026) rebuilt the GUI docs around a shared "TopoViewer" workflow with separate pages for a VS Code extension, desktop app, web app and browser sandbox. Search snippet only; the page was not opened, so what the "web app" does is unverified. | https://containerlab.dev/rn/0.76/ | containerlab.dev release notes | 2026-06-03 | accessed 2026-11-05 | medium | capability

11. clabernetes (Kubernetes variant) requires an existing Kubernetes cluster; the install guide gives no hard minimum and recommends version 1.21 or higher. Search snippet only. Pod privilege requirements were not retrieved. | https://containerlab.dev/manual/clabernetes/install/ | containerlab.dev official docs | undated | accessed 2026-11-05 | medium | capability

### GNS3

12. GNS3 "can be divided in four parts": GUI (gns3-gui desktop or gns3-web), controller, compute, emulators. The controller manages the state of each project and "Only one controller should run"; the compute controls emulators and is the same process when co-located. | https://docs.gns3.com/docs/using-gns3/design/architecture | GNS3 Technologies official docs | undated (footer © 2026) | accessed 2026-11-05 | high | capability

13. All GNS3 communication is HTTP with JSON through the controller's REST API, with notifications over an HTTP stream or WebSocket. This architecture page describes only HTTP basic auth and recommends a VPN if client-server traffic must be encrypted; it does not describe user accounts or roles. The page appears to describe the 2.x design. | https://docs.gns3.com/docs/using-gns3/design/architecture | GNS3 Technologies official docs | undated | accessed 2026-11-05 | high | security

14. gns3-server is GPL-3.0 (about 1.0k stars). The README says clients "like the GNS3 GUI and the GNS3 Web UI control the server using an HTTP REST API." | https://github.com/GNS3/gns3-server | GNS3 GitHub repo | undated | accessed 2026-11-05 | high | licensing

15. Emulators and helpers per the README: Dynamips (IOS routers, internal switches/hubs), QEMU/KVM ("strongly recommended on Linux, as most node types are based on Qemu"), Docker (optional, Linux only), VPCS (simple PC for connectivity tests), uBridge (required, interconnects nodes), IOU (needs i386 libs), VirtualBox. The README does not state that KVM is mandatory. | https://github.com/GNS3/gns3-server | GNS3 GitHub repo | undated | accessed 2026-11-05 | high | capability

16. Versions: on the gns3-server releases page 2.2.61 (30 Jul 2026) carries the "Latest" badge, and a 3.1.0 pre-release series runs from alpha 1 (25 Apr) to alpha 7 (21 Oct 2026). No stable 3.1.0 exists. Year inferred by the fetch tool from page context. | https://github.com/GNS3/gns3-server/releases | GNS3 GitHub releases | 2026-10-21 (newest entry) | accessed 2026-11-05 | medium-high | version

17. A stable 3.0 line exists: a third-party site lists GNS3 v3.0.6 dated 28 Jan 2026 and says the 3.0 server is Linux-only with RBAC multi-user management in the web interface. Search snippet from a non-official site; whether a newer 3.0.x exists was not checked. | https://packettracernetwork.com/download/download-gns3.html | packettracernetwork.com (third party) | 2026-01-28 (version date) | accessed 2026-11-05 | low-medium | version

18. Multi-user work is concentrated in the unreleased 3.x line: 3.0.0 alpha 1 added user groups and per-user permissions (search snippet of GitHub release notes); 3.1.0 alpha 3 added "user isolation based on project ownership" and layered permission checks; alpha 4 added refresh tokens and API keys. Project-level user isolation is thus arriving in alpha builds as of mid-2026, not in the 2.2 line badged "Latest". | https://github.com/GNS3/gns3-server/releases | GNS3 GitHub releases | 2026 (alpha 3: 6 Jun; alpha 4: 9 Jul) | accessed 2026-11-05 | medium-high | security

19. Web UI state: 3.1.0 alpha 1 describes a "completely revamped Web interface"; alpha 7 (21 Oct 2026) was still fixing SSH web-console behaviour after terminal resize. The web UI is a separate client project, not part of the server README's scope. | https://github.com/GNS3/gns3-server/releases | GNS3 GitHub releases | 2026-04-25 to 2026-10-21 | accessed 2026-11-05 | medium-high | capability

### Comparable platforms (all search snippets; pages not opened)

20. Kathará: each device runs as a container, with Docker or Kubernetes as the backend; images include Quagga, FRRouting, Bind, P4, Open vSwitch; runs on Linux, macOS and Windows; GPL v3. | https://pypi.org/project/kathara/3.5.0 and https://github.com/KatharaFramework/Kathara (via awesome.ecosyste.ms listing) | Kathará project / PyPI | undated | accessed 2026-11-05 | medium | licensing

21. netlab builds labs from a YAML topology and delegates to backends: libvirt/KVM with Vagrant, or Docker with containerlab. It is a CLI tool (`netlab up/down/connect`); no web UI appeared in the results. The version quoted in the snippet (1.5.3) came from a fork README and is stale; do not use it. | https://netlab.tools | ipSpace netlab docs | undated | accessed 2026-11-05 | medium | capability

22. Mininet builds networks from processes in separate Linux network namespaces joined by veth pairs; examples invoke it as `sudo mn`. License not confirmed this run. | https://www.net.in.tum.de/fileadmin/TUM/NET/NET-2019-10-1/NET-2019-10-1_11.pdf | TU Munich seminar paper | 2019-10 | accessed 2026-11-05 | medium | capability

23. EVE-NG: the official system-requirements page calls for an Intel CPU with VT-x/EPT and says 4 vCPU / 6 GB RAM can suffice for IOU/IOL and Dynamips only but not for CSR1000V topologies. The page's listed host versions look outdated. | https://www.eve-ng.net/index.php/documentation/installation/system-requirement/ | EVE-NG Ltd | undated | accessed 2026-11-05 | medium | performance-scale

24. EVE-NG Community Edition does not include Docker nodes ("only Pro has it"), according to a 2026 forum reply. User claim, not official documentation. | https://www.eve-ng.net/forum/viewtopic.php?p=46599 | EVE-NG forum (user post) | 2026 | accessed 2026-11-05 | low | capability

### Per-node resource numbers

25. Containers: a CodiLime blog measured two FRR containers under containerlab with `docker stats` at about 25 MiB and 37 MiB, concluded roughly 30 MB per FRR container, and extrapolated "at least 500 nodes" on 32 GB RAM. Four-node sample, idle, extrapolation untested; search snippet. | https://codilime.com/blog/latest-addition-to-network-testing-and-simulation-containerlab/ | CodiLime (vendor blog) | undated in retrieval | accessed 2026-11-05 | low-medium | performance-scale

26. Containers: an ipSpace article on FRR-container labs suggests 2 GB RAM / 2 vCPU as a minimum host, with about 1 GB of that being idle system memory. Search snippet. | https://blog.ipspace.net/2023/06/learn-routing-protocols-frr/ | ipSpace.net (Ivan Pepelnjak) | 2023-06 | accessed 2026-11-05 | medium | performance-scale

27. VMs: a third-party EVE-NG guide gives 1 CPU / 512 MB RAM per IOSvL2 switch and 2-4 CPUs / 4-8 GB RAM per CSR1000V router. Search snippet; the exact page was not identified in the summary. | https://cylab.be/blog/360/getting-started-with-eve-ng (probable source) | cylab.be (third party) | undated | accessed 2026-11-05 | low | performance-scale

28. A README claim of "~50MB per router vs 1GB+ for VM-based labs" exists with no methodology; treat as advocacy. | mirror of github.com/ciscoittech/containerlab-free-labs | community repo | undated | accessed 2026-11-05 | low | performance-scale

### Reading across the findings (inference, not a retrieved claim)

- Every platform found assumes a trusted operator on the host: containerlab needs root-equivalent group membership (5), its API server runs as root with a mounted Docker socket (9), and GNS3's documented baseline is basic auth plus a VPN (13). None is documented as a sandbox for untrusted browser users.
- By the only numbers retrieved, container nodes are 10x to 100x lighter than VM nodes (25-27), but the container figures are small-sample and idle.

## Leads worth chasing

- containerlab TopoViewer "web app" and "browser sandbox" pages (containerlab.dev GUI docs, rebuilt in 0.76): determine whether the web app is single-user tooling or something a class could share.
- clab-api-server releases page and issue tracker: release cadence, open security issues, and whether anyone runs it for classrooms.
- clabernetes manual (https://containerlab.dev/manual/clabernetes/): whether launcher pods run privileged and what cluster size is expected.
- GNS3 3.0.x final release notes and 3.x docs: confirm Linux-only server, RBAC scope, and whether the docs architecture page is stale for 3.x.
- EVE-NG CE cookbook 6.2 (2024 PDF, https://www.eve-ng.net/wp-content/uploads/2024/05/EVE-CE-BOOK-6.2-2024.pdf): has a hardware section and nodes-per-lab calculator; also the EVE-NG license terms.
- Kathará wiki / issues: rootless Docker support and privilege model; its Kubernetes backend ("Megalos").
- Open the CodiLime post to get its date and measurement setup.

## Looked for but could not find

- Evidence of containerlab being used as the backend of a multi-tenant web application: none found. Not searched exhaustively, so this is absence in a small sample.
- Whether containerlab node containers themselves run privileged: not stated on the pages opened.
- KVM / nested-virtualization requirement for containerlab VM-based kinds and for GNS3 QEMU nodes: neither the kinds page, the install page, nor the GNS3 README states it. Only EVE-NG's VT-x/EPT requirement was evidenced.
- GNS3 official hardware requirements and per-node RAM figures: the docs root URL returned 404 and no sizing page was opened.
- GNS3 design capacity for many concurrent users/projects on one server: no statement found; only the single-controller rule and the alpha-stage isolation features.
- The current stable GNS3 3.0.x version from a primary source, and why 2.2.61 carries the "Latest" badge.
- CORE and Labtainers: nothing retrieved (the one search covering CORE returned no CORE results).
- Mininet license and netlab license/current version: not confirmed.
- clab-api-server latest release version and date: not shown on the repo page.
- Any controlled benchmark of container vs VM lab density: none found, only blog measurements and extrapolations.
- Web UI presence for Kathará, Mininet and netlab: no web UI appeared in the results, which is not proof that none exists.
