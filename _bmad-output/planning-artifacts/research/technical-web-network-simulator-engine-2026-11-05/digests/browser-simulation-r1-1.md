# Digest: in-browser simulation feasibility (browser-simulation-r1-1)

Run date: 2026-11-05. Budget used: 8 sources opened, 16 tool calls before writing. Claims marked "search snippet" come from a search result whose page was not opened; treat them as leads, not as verified facts.

## Findings

### Q1. Existing browser-based or self-written simulators

1. Cisco's own Packet Tracer FAQ says the program "uses simplified models of networking protocols and Cisco IOS", uses "real Cisco IOS images as references", and "supports a small subset of the features from Cisco devices"; it tells users to compare results against real equipment. That is the description of a self-written simulator that does not run real IOS, although the page never uses the words "simulator" or "emulator". | https://tutorials.ptnetacad.net/help/default/faqTroubleShoot.htm | Cisco Networking Academy (Packet Tracer help) | undated (page references Packet Tracer 9.0.0+) | accessed 2026-11-05 | high | capability

2. The same FAQ lists specific unsupported commands (for example, it states Packet Tracer does not support the `ip address secondary` command), so even the reference product leaves features out. Only the first 100,000 of about 139,000 characters were read; the "Protocol Modeling" answers were not covered. | https://tutorials.ptnetacad.net/help/default/faqTroubleShoot.htm | Cisco Networking Academy | undated | accessed 2026-11-05 | medium | capability

3. GEduNet (MegaRedHand/network-simulator) is a browser-only teaching simulator in TypeScript (webpack build, hosted on GitHub Pages), MIT-licensed, with 185 commits and 9 stars. It implements ARP with per-device ARP tables, self-learning switches, static routing with manually edited tables, ICMP echo, TCP (Reno/Tahoe with retransmission, RTT estimation, flow and congestion control), and an HTTP program. IPv4 only. | https://github.com/MegaRedHand/network-simulator | GitHub (project README) | undated (last commit date not visible in fetched page) | accessed 2026-11-05 | high | capability

4. GEduNet's README documents what it left out: no VLANs mentioned, no dynamic routing (OSPF/BGP explicitly not simulated), no Gateway or Metric fields in routing tables ("intentionally omitted"), no LAN/subnet concept (routing tables default to exact-match entries), no ageing of switch forwarding entries (deletion "delegated to the user"), and fixed port counts (hosts 1, routers 4, switches 8). The README warns that its ARP behaviour should not be taken as representative of real networks. | https://github.com/MegaRedHand/network-simulator | GitHub (project README) | undated | accessed 2026-11-05 | high | capability

5. GEduNet carries the repository topic tags "fiuba" and "ta048", which suggests a university course project (Universidad de Buenos Aires engineering faculty is my inference from the tag; the page does not state it). Team size and effort are not stated. | https://github.com/MegaRedHand/network-simulator | GitHub | undated | accessed 2026-11-05 | low | other

6. NetSim Community Edition (netsim-labs/netsim) describes a Rust engine compiled to WebAssembly with a React 18 + Zustand + React Flow + Tailwind frontend, running client-side. The README claims "Logic for OSPF, BGP, STP, and CLI parsing", Cisco IOS and Huawei VRP command syntaxes, and labs for STP, OSPF and VLAN. ARP, static routing, RIP, NAT, ICMP and DHCP are not mentioned. | https://github.com/netsim-labs/netsim | GitHub (project README) | undated (version badge 1.1.0) | accessed 2026-11-05 | low (self-reported, marketing register such as "Zero latency") | capability

7. NetSim Community Edition is AGPL-3.0; the README adds that it is free for personal and educational use and that "Commercial use requires a dedicated license". The repository shows only 5 commits on main, 6 stars and 3 forks, and its Quick Start refers to a directory name that does not match the repository, which points to a code drop and not an openly developed project. | https://github.com/netsim-labs/netsim | GitHub | undated | accessed 2026-11-05 | high for license and counts; the "code drop" reading is my inference | licensing

8. Filius is developed on GitLab (filius1/filius): 934 commits, 51 tags, repository created 2020-05-18. The fetched page exposed no README text, so protocols, language and latest release were not confirmed from the primary source. | https://gitlab.com/filius1/filius | GitLab (project page) | undated | accessed 2026-11-05 | high for counts | other

9. Search snippets (pages not opened): a SignPath project listing gives Filius's license as GNU GPL v3; Debian's package page lists filius 2.9.4+ds-1 in sid, with a description covering simulated desktops, servers, switches, routers and "Ethernet and the TCP/IP protocol suite". | https://signpath.org/projects/filius and https://packages.debian.org/fr/sid/filius | SignPath Foundation; Debian | undated | accessed 2026-11-05 | medium | licensing / version

10. Search snippet (page not opened): YJDoc2/Network-Simulator is a Svelte app where users supply JavaScript logic per node; dual-licensed Apache-2.0 and MIT; last push in 2022 per an ecosyste.ms listing. It is a generic graph/packet sandbox, not a router/switch CLI simulator. | https://github.com/YJDoc2/Network-Simulator | GitHub; ecosyste.ms | undated | accessed 2026-11-05 | low | capability

### Q2. Real network software in the browser (v86, container2wasm, WebVM)

11. v86 has an "inbrowser" network backend that provides raw Ethernet between multiple v86 guests in the same browser process (same page or separate tabs) using the BroadcastChannel API. It needs no proxy server and gives no access to external networks. The docs call it the most efficient backend but note that all VMs share the same browser resources. | https://github.com/copy/v86/blob/master/docs/networking.md | GitHub (copy/v86 official docs) | undated | accessed 2026-11-05 | high | capability

12. v86's docs point to `examples/two_instances.html`, which connects two VMs in one page with a virtual Ethernet crossover cable through a custom backend. NIC emulation is NE2000 or VirtIO, with VirtIO recommended first. The other backends (wisp, fetch) isolate guests from each other; wsproxy needs a server-side proxy. | https://github.com/copy/v86/blob/master/docs/networking.md | GitHub (copy/v86 official docs) | undated | accessed 2026-11-05 | high | capability

13. The v86 networking document gives no figures for memory per guest, CPU cost, or how many guests one page can sustain. I found no documented performance or memory limit for multi-guest use this run. | https://github.com/copy/v86/blob/master/docs/networking.md | GitHub (copy/v86) | undated | accessed 2026-11-05 | high (as an absence in this document) | performance-scale

14. Search snippet (v86 README not opened): v86 translates machine code to WebAssembly at runtime, "Linux works pretty well", 64-bit kernels are not supported, and Buildroot is suggested for minimal guest images. | https://github.com/copy/v86 | GitHub (copy/v86) | undated | accessed 2026-11-05 | medium | capability

15. container2wasm converts a container into a Wasm image that runs the container plus a Linux kernel on an emulated CPU (Bochs for x86_64, TinyEMU for riscv64, QEMU for the browser/emscripten path). The README states "This is an experimental software." License is Apache-2.0, but generated images bundle GPL components (Linux, GRUB) and LGPL Bochs. | https://github.com/container2wasm/container2wasm | GitHub (project README) | undated (v0.5.0 appears in download URLs; not confirmed as latest) | accessed 2026-11-05 | high | capability / licensing

16. container2wasm's documented browser networking is outbound only: a Fetch-API-based stack limited by CORS, or a WebSocket delegate to a host-side `c2w-net` process ("tested only on Linux"). The README does not describe networking several containers to each other inside one page, and states no memory, performance or image-size limits. | https://github.com/container2wasm/container2wasm | GitHub (project README) | undated | accessed 2026-11-05 | high (as an absence in the README) | capability

17. One search for FRRouting combined with WebAssembly/v86 returned no project, port, issue or write-up showing FRR or any routing daemon running in a browser VM. This is thin negative evidence from a single query, not proof of absence. | search query "FRRouting WebAssembly browser v86" (results: github.com/copy/v86 and forks) | n/a | n/a | accessed 2026-11-05 | low | capability

### Q3. Frontend building blocks

18. React Flow and Svelte Flow (xyflow) are MIT-licensed; the README states this directly. Organisations are asked, not required, to support the project through React Flow Pro or GitHub Sponsors; the README states no attribution requirement. The repository has 38.9k stars. | https://github.com/xyflow/xyflow | GitHub (xyflow README) | undated | accessed 2026-11-05 | high for MIT; medium for "no attribution requirement" (README only; reactflow.dev pricing/attribution pages not opened) | licensing

19. The xyflow README example uses an `onConnect` callback with `addEdge` to create edges between nodes and shows a `type: 'custom'` node. Handles (ports) and drag-and-drop from a palette were not described on the fetched page. At least one existing network simulator (finding 6) uses React Flow for its topology editor. | https://github.com/xyflow/xyflow and https://github.com/netsim-labs/netsim | GitHub | undated | accessed 2026-11-05 | medium | capability

20. xterm.js latest release shown is 6.0.0 (dated "22 Dec", year not displayed in the fetched text), preceded by 5.5.0 and 5.4.0. The old `xterm` / `xterm-*` packages are deprecated in favour of scoped `@xterm/*` packages. 6.0.0 removed the canvas renderer addon (use DOM or WebGL), changed viewport/scrollbar behaviour, and removed the `windowsMode` and `fastScrollModifier` options. | https://github.com/xtermjs/xterm.js/releases | GitHub (xtermjs releases) | 22 Dec, year not shown | accessed 2026-11-05 | high for version; release year unverified | version

21. Search snippets (pages not opened): JointJS open-source core is under Mozilla Public License 2.0; the commercial JointJS+ tier is licensed per developer, with updates after year one priced at $1,490/year per license per JointJS's FAQ. | https://www.jointjs.com/license and https://www.jointjs.com/faq | JointJS (client IO) | undated | accessed 2026-11-05 | medium | licensing

22. Search snippet (page not opened): a third-party comparison table lists Cytoscape.js as open-source MIT. | https://portalzine.de/visualize-this-open-source-diagram-tools-to-replace-gojs/ | portalzine.de (blog) | undated | accessed 2026-11-05 | low (secondary source) | licensing

### Q4. Difficulty and pitfalls of writing your own teaching simulator

23. The clearest evidence found is indirect: the list of omissions in GEduNet (finding 4) and Cisco's "small subset" statement (finding 1). A 185-commit student-oriented simulator reached ARP, MAC learning, static routing, ICMP and TCP but left out VLANs, subnets/gateways, dynamic routing and table ageing. | https://github.com/MegaRedHand/network-simulator | GitHub | undated | accessed 2026-11-05 | medium (inference from scope, no effort figure stated) | other

24. Search snippets (papers not opened): a 2002 ISI paper on teaching with ns-2 (Papadopoulos and Heidemann) reports that students lacked grounding in discrete-event simulation and that focused single-concept animations worked better; a WebLan-Designer presentation (Sarkar and Petrova, 2020) notes that software maintenance cost is significant. Neither is a post-mortem on implementing protocol logic. | https://www3.isi.edu/~johnh/PAPERS/Papadopoulos02a.pdf and https://stemtec.aut.ac.nz/__data/assets/pdf_file/0007/470761/Sarkar_Petrova_WebLanDesigner-presentation-28_Nov-2020.pdf | USC/ISI; Auckland University of Technology | 2002; 2020-11-28 | accessed 2026-11-05 | low | other

## Leads worth chasing

- GEduNet source and commit history (https://github.com/MegaRedHand/network-simulator): last commit date, contributor count, and how the engine is structured. It is MIT, so it is the closest reusable or reference codebase found.
- v86 `examples/two_instances.html` and the v86 README/issue tracker: guest memory settings, boot time, and any reports of more than two guests in one page. This decides whether a "real Linux in the browser" hybrid is even plausible.
- Filius README and CHANGELOG on GitLab (https://gitlab.com/filius1/filius): protocol list, language, latest release date. Its long history (934 commits since 2020 on GitLab alone) is a useful effort benchmark for a mature teaching simulator.
- reactflow.dev: current major version of `@xyflow/react`, the Handle component docs, the drag-and-drop example, and the exact wording on the attribution badge and Pro.
- Konva and Cytoscape.js primary pages (repository LICENSE files, current versions).
- WebVM / CheerpX (Leaning Technologies): licence terms and networking model; not researched this run.
- A Reddit r/SideProject post about "NetworkSim", a free browser network simulator, appeared in results but was not opened.
- LucasSchroeder99/WSNWE (web-based simulator for web engineering education, Zenodo record 13693453, published 2024-09-05): covers DNS, NAT, TLS, packet switching per the search snippet.
- The remaining 39,000 characters of the Packet Tracer FAQ, which contain the "Protocol Modeling" answers.
- Springer 2009 paper on Packet Tracer (s10956-009-9192-0) for Cisco-affiliated authors' description of the simulator design.

## Looked for but could not find

- A statement on a Cisco page that uses the word "simulator" or "emulator" for Packet Tracer. The FAQ describes simplified models but does not use either label; third-party sites call it a simulation tool.
- Any evidence of FRRouting, BIRD or another routing daemon running under v86, container2wasm or WebVM. One query, no hits.
- Documented memory or performance limits for several Linux guests in one browser page (v86 or container2wasm). Neither document read gives numbers.
- Whether container2wasm can network several containers to each other in one page. The README is silent.
- Anything on WebVM / CheerpX. Not searched within budget.
- Current major version of React Flow (`@xyflow/react`), and whether the attribution badge may be removed without a Pro subscription. The repository page showed no release list. Unverified belief from prior knowledge: version 12.x, and attribution removal is permitted but discouraged; confirm before relying on it.
- Konva's licence and version, and current versions of Cytoscape.js and JointJS. Unverified belief: Konva and Cytoscape.js are MIT.
- xterm.js licence (not shown on the releases page; unverified belief: MIT) and the year of the 6.0.0 release.
- Filius's protocol list, implementation language, and whether it has any browser version, from a primary source. Unverified belief: it is a Java desktop application.
- Last-commit dates for GEduNet, NetSim Community Edition, and container2wasm; the fetched pages did not expose them, so project activity over time is unassessed.
- Team size or development effort figures for any simulator.
- A write-up by someone who built a teaching protocol simulator describing what was hard. Only indirect evidence (documented omissions) was found.
- Commercial browser-based products (for example NetSim by Boson or Tetcos) were not examined.
